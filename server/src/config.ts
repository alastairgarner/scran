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
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  // Only isolated loopback previews may opt out of production HTTPS.
  ALLOW_INSECURE_HTTP: z.stringbool().default(false),
  MAX_EXTRACTIONS_PER_USER_DAY: z.coerce.number().int().positive().default(60),
  MAX_EXTRACTIONS_PER_DAY: z.coerce.number().int().positive().default(200),
  MAX_STORED_SOURCE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 ** 3),
  MAX_CONCURRENT_EXTRACTIONS: z.coerce.number().int().min(1).max(4).default(2),
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
  // Existing direct Caddy installs overwrite X-Forwarded-For. Switch only after
  // the proxy has been configured to overwrite the chosen single-IP header.
  AUTH_IP_HEADER: z
    .enum(['x-forwarded-for', 'x-real-ip'])
    .default('x-forwarded-for'),
  AUTH_COOKIE_PREFIX: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default('better-auth'),
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

  const origin = new URL(parsed.data.BASE_URL);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    parsed.data.BASE_URL !== origin.origin
  ) {
    throw new Error(
      'BASE_URL must be an HTTP(S) origin, without credentials, path or trailing slash.',
    );
  }
  if (origin.protocol === 'https:' && !parsed.data.COOKIE_SECURE) {
    throw new Error('HTTPS BASE_URL requires COOKIE_SECURE=true.');
  }
  const insecurePreview =
    parsed.data.ALLOW_INSECURE_HTTP &&
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (
    parsed.data.NODE_ENV === 'production' &&
    origin.protocol !== 'https:' &&
    !insecurePreview
  ) {
    throw new Error(
      'Production requires an HTTPS BASE_URL; only explicit loopback previews may use HTTP.',
    );
  }

  return {
    maxExtractionsPerUserDay: parsed.data.MAX_EXTRACTIONS_PER_USER_DAY,
    maxExtractionsPerDay: parsed.data.MAX_EXTRACTIONS_PER_DAY,
    maxStoredSourceBytes: parsed.data.MAX_STORED_SOURCE_BYTES,
    maxConcurrentExtractions: parsed.data.MAX_CONCURRENT_EXTRACTIONS,
    dataDir: parsed.data.DATA_DIR,
    databaseUrl: parsed.data.DATABASE_URL,
    openaiApiKey: parsed.data.OPENAI_API_KEY,
    openaiModel: parsed.data.OPENAI_MODEL,
    logLevel: parsed.data.LOG_LEVEL,
    port: parsed.data.PORT,
    baseUrl: parsed.data.BASE_URL,
    authSecret: parsed.data.AUTH_SECRET,
    authCookiePrefix: parsed.data.AUTH_COOKIE_PREFIX,
    authIpHeader: parsed.data.AUTH_IP_HEADER,
    cookieSecure: parsed.data.COOKIE_SECURE,
  };
}

export const config = parseConfig(process.env);
