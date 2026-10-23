import type { Database } from 'bun:sqlite';

import { HTTPException } from 'hono/http-exception';

import { config } from './config';
import { db } from './db';

export const MAX_RECIPE_VERSIONS = 200;
export const MODEL_IMAGE_EDGE = 2048;
export const MAX_MODEL_PHOTO_BYTES = 2 * 1024 ** 2;
export const OPENAI_TIMEOUT_MS = 90_000;
export const OPENAI_MAX_COMPLETION_TOKENS = 8192;
export const MIN_FREE_SOURCE_BYTES = 256 * 1024 ** 2;

/** No queue: admission is synchronous, shared across all users. */
export class WorkLimiter {
  private active = 0;

  constructor(private readonly maximum: number) {}

  acquire(): () => void {
    if (this.active >= this.maximum) {
      throw new HTTPException(503, {
        message: 'The recipe reader is busy. Try again shortly.',
      });
    }
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }
}

/** Both counters are checked and charged atomically, before any costly work. */
export function chargeDailyUsage(
  database: Database,
  userId: string,
  limits: { kind: string; user: number; global: number },
  day = new Date().toISOString().slice(0, 10),
): void {
  database
    .transaction(() => {
      const scopes = [
        { scope: 'global', limit: limits.global },
        { scope: `user:${userId}`, limit: limits.user },
      ];
      for (const { scope, limit } of scopes) {
        const row = database
          .query<{ count: number }, [string, string, string]>(
            'SELECT count FROM resourceUsage WHERE day = ? AND scope = ? AND kind = ?',
          )
          .get(day, scope, limits.kind);
        if ((row?.count ?? 0) >= limit) {
          throw new HTTPException(429, {
            message: 'The daily limit has been reached. Try again tomorrow.',
          });
        }
      }
      for (const { scope } of scopes) {
        database.run(
          `INSERT INTO resourceUsage (day, scope, kind, count) VALUES (?, ?, ?, 1)
         ON CONFLICT (day, scope, kind) DO UPDATE SET count = count + 1`,
          [day, scope, limits.kind],
        );
      }
    })
    .immediate();
}

const extractions = new WorkLimiter(config.maxConcurrentExtractions);

export function beginExtraction(userId: string): () => void {
  const release = extractions.acquire();
  try {
    chargeDailyUsage(db, userId, {
      kind: 'extraction',
      user: config.maxExtractionsPerUserDay,
      global: config.maxExtractionsPerDay,
    });
    return release;
  } catch (error) {
    release();
    throw error;
  }
}

export function chargeEdit(userId: string): void {
  chargeDailyUsage(db, userId, { kind: 'edit', user: 200, global: 1000 });
}

// Decode only one full-resolution image at a time, including preview routes.
// At most two callers may wait; an upload flood cannot build a memory queue.
let preparingPhoto = false;
const photoWaiters: (() => void)[] = [];

export async function withPhotoPreparation<T>(
  work: () => Promise<T>,
): Promise<T> {
  if (preparingPhoto) {
    if (photoWaiters.length >= 2) {
      throw new HTTPException(503, {
        message: 'Photo processing is busy. Try again shortly.',
      });
    }
    await new Promise<void>(resolve => photoWaiters.push(resolve));
  } else {
    preparingPhoto = true;
  }
  try {
    return await work();
  } finally {
    const next = photoWaiters.shift();
    if (next) {
      next();
    } else {
      preparingPhoto = false;
    }
  }
}
