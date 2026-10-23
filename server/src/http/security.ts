import { createHash } from 'node:crypto';

import { getIp } from 'better-auth/api';
import type { MiddlewareHandler } from 'hono';

import { auth, readInvite } from '../auth';
import { config } from '../config';

export const MAX_REQUEST_BYTES = 55 * 1024 ** 2;
const SMALL_BODY_BYTES = 16 * 1024;
const JSON_BODY_BYTES = 1024 ** 2;

/** Never record the bearer credential, including malformed/encoded variants. */
export function safeRequestPath(path: string): string {
  return path.replace(
    /^(\/(?:api\/invites|invite))(?:\/|%2f).*/i,
    '$1/[redacted]',
  );
}

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'geolocation=(), microphone=()');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  if (config.baseUrl.startsWith('https:')) {
    c.header('Strict-Transport-Security', 'max-age=31536000');
  }
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/invite/')) {
    c.header('Cache-Control', 'no-store');
  }
  await next();
};

const requestOwners = new WeakMap<Request, string>();

/** Server-only identity, never inferred from client-supplied account fields. */
export function identifyRequest(request: Request, userId: string): void {
  requestOwners.set(request, userId);
}

export function requestClientIp(request: Request): string {
  // Match Better Auth's trusted-header parsing and IPv6 /64 grouping exactly.
  return getIp(request, auth.options) ?? 'direct-client';
}

/** Count real bytes, not just Content-Length, before any parser allocates. */
export function requestBodyLimits({
  smallDeadlineMs = 10_000,
  uploadIdleMs = 30_000,
  uploadDeadlineMs = 15 * 60_000,
}: {
  smallDeadlineMs?: number;
  uploadIdleMs?: number;
  uploadDeadlineMs?: number;
} = {}): MiddlewareHandler {
  let largeBodies = 0;
  const bodiesByOwner = new Map<string, number>();
  return async (c, next) => {
    if (!c.req.raw.body) {
      return next();
    }
    const path = c.req.path;
    if (!path.startsWith('/api/')) {
      return c.json(
        { error: 'Request bodies are only accepted by the API.' },
        405,
      );
    }
    const json = c.req.header('content-type')?.startsWith('application/json');
    const maxBytes =
      path.startsWith('/api/auth/') || path.startsWith('/api/invites/')
        ? SMALL_BODY_BYTES
        : path === '/api/photos/preview'
          ? 21 * 1024 ** 2
          : path === '/api/recipes' && !json
            ? MAX_REQUEST_BYTES
            : JSON_BODY_BYTES;
    const large = maxBytes > JSON_BODY_BYTES;
    const userId = requestOwners.get(c.req.raw);
    const owner = userId
      ? `user:${userId}`
      : `ip:${requestClientIp(c.req.raw)}`;
    const ownerKey = `${large ? 'upload' : 'json'}:${owner}`;
    const ownerBodies = bodiesByOwner.get(ownerKey) ?? 0;
    // An anonymous slow sender can occupy only its own slots, never a shared
    // sign-in/write pool. Global large-body admission is authenticated upstream.
    if ((large && largeBodies >= 2) || ownerBodies >= (large ? 1 : 4)) {
      return c.json(
        { error: 'Too many requests in progress. Try again shortly.' },
        429,
      );
    }
    if (large) {
      largeBodies++;
    }
    bodiesByOwner.set(ownerKey, ownerBodies + 1);
    try {
      const reader = c.req.raw.body.getReader();
      const chunks: ArrayBuffer[] = [];
      let bytes = 0;
      let timedOut = false;
      const expire = () => {
        timedOut = true;
        void reader.cancel().catch(() => undefined);
      };
      const deadline = setTimeout(
        expire,
        large ? uploadDeadlineMs : smallDeadlineMs,
      );
      let idle: ReturnType<typeof setTimeout> | undefined;
      const touch = () => {
        if (large) {
          clearTimeout(idle);
          idle = setTimeout(expire, uploadIdleMs);
        }
      };
      touch();
      try {
        while (true) {
          const part = await reader.read();
          if (timedOut) {
            return c.json({ error: 'Request body timed out.' }, 408);
          }
          if (part.done) {
            break;
          }
          bytes += part.value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            return c.json({ error: 'That request is too large.' }, 413);
          }
          chunks.push(new Uint8Array(part.value).buffer);
          touch();
        }
      } catch {
        return c.json(
          {
            error: timedOut
              ? 'Request body timed out.'
              : 'Could not read that request.',
          },
          timedOut ? 408 : 400,
        );
      } finally {
        clearTimeout(deadline);
        clearTimeout(idle);
        reader.releaseLock();
      }
      c.req.raw = new Request(c.req.raw, {
        method: c.req.method,
        body: new Blob(chunks),
      });
      // Keep admission until decoding/processing the request has finished.
      await next();
    } finally {
      if (large) {
        largeBodies--;
      }
      const remaining = (bodiesByOwner.get(ownerKey) ?? 1) - 1;
      if (remaining > 0) {
        bodiesByOwner.set(ownerKey, remaining);
      } else {
        bodiesByOwner.delete(ownerKey);
      }
    }
  };
}

/** A bounded, expiring limiter; restarting clears it, so proxy limits still help. */
export function createRequestLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}) {
  const windows = new Map<string, { count: number; until: number }>();
  return (key: string, now = Date.now()): boolean => {
    for (const [storedKey, window] of windows) {
      if (window.until <= now) {
        windows.delete(storedKey);
      }
    }
    const window = windows.get(key);
    if (window) {
      if (window.count >= limit) {
        return false;
      }
      window.count++;
      return true;
    }
    // Preserve existing callers' budgets without turning map pressure into a
    // global lockout. New keys fall back to the independent IP/library limits.
    if (windows.size >= maxKeys) {
      return true;
    }
    windows.set(key, { count: 1, until: now + windowMs });
    return true;
  };
}

const allowInvite = createRequestLimiter({ limit: 100, windowMs: 60_000 });
const allowLogin = createRequestLimiter({ limit: 20, windowMs: 10 * 60_000 });

export const publicRequestLimits: MiddlewareHandler = async (c, next) => {
  const ip = requestClientIp(c.req.raw);
  if (
    (c.req.path.startsWith('/api/invites/') ||
      (c.req.path.startsWith('/api/auth/') && c.req.method === 'POST')) &&
    !allowInvite(ip)
  ) {
    c.header('Retry-After', '60');
    return c.json(
      { error: 'Too many authentication requests. Try again shortly.' },
      429,
    );
  }
  if (c.req.method === 'POST' && /^\/api\/invites\/[^/]+$/.test(c.req.path)) {
    const token = c.req.path.split('/').pop() ?? '';
    // Expensive body parsing and password hashing need a live invite first.
    readInvite(token);
  }
  await next();
};

/** Runs after the small body bound and complements Better Auth's IP limit. */
export const accountLoginLimit: MiddlewareHandler = async (c, next) => {
  if (c.req.method === 'POST' && c.req.path === '/api/auth/sign-in/email') {
    const body: unknown = await c.req.raw
      .clone()
      .json()
      .catch(() => undefined);
    if (
      body &&
      typeof body === 'object' &&
      'email' in body &&
      typeof body.email === 'string'
    ) {
      const key = createHash('sha256')
        .update(body.email.trim().toLowerCase())
        .digest('hex');
      if (!allowLogin(key)) {
        c.header('Retry-After', '600');
        return c.json(
          {
            error:
              'Too many sign-in attempts for this account. Try again later.',
          },
          429,
        );
      }
    }
  }
  await next();
};
