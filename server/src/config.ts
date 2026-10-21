import { join } from 'node:path';

import { z } from 'zod';

// The defaults are the laptop layout, anchored to the repo rather than to the
// working directory — `bun run --filter` starts the server from `server/`, and
// the photos are the one thing that must never end up somewhere new. Deployment
// sets both variables absolutely.
const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * The only place in the codebase that reads `process.env`. Parsed at import so
 * a missing variable kills the process at boot rather than at the first
 * request that needed it.
 */
const envSchema = z.object({
  DATA_DIR: z.string().default(join(REPO_ROOT, 'data')),
  DATABASE_URL: z.string().default(join(REPO_ROOT, 'data', 'scran.db')),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4.1'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  BASE_URL: z.url().default('http://localhost:5173'),
  // Signs the session cookie. A leaked database replays as 401 without it, so
  // it is the one secret that must not be backed up beside `scran.db`.
  AUTH_SECRET: z.string().min(32),
  // Off on the LAN, on behind TLS. The whole TLS story that is in scope.
  COOKIE_SECURE: z.stringbool().default(false),
});

export type Config = ReturnType<typeof parseConfig>;

/**
 * @returns {Config} The environment, validated and renamed to house style.
 * @throws {Error} Listing every variable that is missing or unusable.
 */
export function parseConfig(env: Record<string, string | undefined>) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // ponytail: a plain Error, not an AppError — nothing has booted yet that
    // could classify it, and the process is about to die either way.
    const problems = parsed.error.issues
      .map(issue => `${issue.path.join('.')} (${issue.message})`)
      .join(', ');
    throw new Error(`Unusable environment: ${problems}`);
  }

  return {
    dataDir: parsed.data.DATA_DIR,
    databaseUrl: parsed.data.DATABASE_URL,
    openaiApiKey: parsed.data.OPENAI_API_KEY,
    openaiModel: parsed.data.OPENAI_MODEL,
    logLevel: parsed.data.LOG_LEVEL,
    port: parsed.data.PORT,
    baseUrl: parsed.data.BASE_URL,
    authSecret: parsed.data.AUTH_SECRET,
    cookieSecure: parsed.data.COOKIE_SECURE,
  };
}

export const config = parseConfig(process.env);
