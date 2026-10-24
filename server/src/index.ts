import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { csrf } from 'hono/csrf';
import { requestId } from 'hono/request-id';

import { activeSession, auth, migrateAuth } from './auth';
import { config } from './config';
import { db, migrate } from './db';
import { ClientError, errorHandler } from './errors';
import { managementRoutes } from './http/admin';
import { invites } from './http/invites';
import { recipeRoutes } from './http/recipes';
import {
  accountLoginLimit,
  identifyRequest,
  MAX_REQUEST_BYTES,
  publicRequestLimits,
  requestBodyLimits,
  safeRequestPath,
  securityHeaders,
} from './http/security';
import { logger } from './logger';
import { sweepStalePending, syncTagSearch } from './recipes';
import { chargeDailyUsage } from './resource-limits';

const applied = migrate(db);
if (applied.length > 0) {
  logger.info({ migrations: applied }, 'Applied migrations');
}
// Better Auth's four tables are its own to create, and its migrator is
// idempotent — so boot repeats it and an empty database ends up complete.
await migrateAuth();

// The tag vocabulary is a TS constant; the search triggers are SQL. This is
// the one line that keeps the second in step with the first.
syncTagSearch();

// A restart mid-extraction leaves a row pending forever, because the promise
// that would have finished it died with the process. Unstick them on the way
// up — `failed` is retryable from the photo already on disk.
const unstuck = sweepStalePending();
if (unstuck > 0) {
  logger.warn({ recipes: unstuck }, 'Failed recipes left pending by a restart');
}

const app = new Hono();

app.use('*', requestId());
app.use('*', securityHeaders);
// Inspect the configured origin before parsing bodies or charging allowances.
app.use('*', csrf({ origin: config.baseUrl }));
app.use('*', publicRequestLimits);
// Reject anonymous uploads before buffering any multipart bytes. Routes still
// enforce requireUser and supply the authenticated author to domain operations.
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (
    path !== '/api/health' &&
    !path.startsWith('/api/auth/') &&
    !path.startsWith('/api/invites/')
  ) {
    const session = await activeSession(c.req.raw.headers);
    if (!session) {
      throw ClientError.unauthorised('Sign in to continue.');
    }
    identifyRequest(c.req.raw, session.user.id);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      // Comments/tags/ratings must not be an unlimited SQLite growth path.
      chargeDailyUsage(db, session.user.id, {
        kind: 'mutation',
        user: 1000,
        global: 10_000,
      });
    }
  }
  await next();
});
app.use('*', requestBodyLimits());
app.use('*', accountLoginLimit);

app.use('*', async (c, next) => {
  const startedAt = performance.now();
  await next();
  logger.info(
    {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: safeRequestPath(c.req.path),
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    },
    'Request',
  );
});

app.get('/api/health', c => c.json({ ok: true }));

// Invites are the only way in, so Better Auth's own sign-up endpoint is never
// exposed — redemption calls it server-side, after burning a token. Registered
// before the catch-all below, which would otherwise answer it.
app.all('/api/auth/sign-up/*', () => {
  throw ClientError.notFound('Not found.');
});
app.on(['GET', 'POST'], '/api/auth/*', c => auth.handler(c.req.raw));

// Chained, because this is what `hc<AppType>` reads on the client — ticket 05.
const routes = app
  .route('/', invites)
  .route('/', recipeRoutes)
  .route('/', managementRoutes);

// Docker starts from the repository root and ships the built client here.
// Preserve API errors and missing-asset 404s rather than returning HTML.
app.get('/assets/*', serveStatic({ root: './client/dist' }));
app.on(
  'GET',
  [
    '/',
    '/signin',
    '/invite/:token',
    '/capture',
    '/recipes/:id',
    '/account',
    '/admin',
    '/ui',
  ],
  serveStatic({ path: './client/dist/index.html' }),
);

/** The client's view of this server: every endpoint, typed. */
export type AppType = typeof routes;

// One boundary for every route. Nothing catches below this.
app.onError(errorHandler);

logger.info({ port: config.port, baseUrl: config.baseUrl }, 'scran listening');

export default {
  port: config.port,
  maxRequestBodySize: MAX_REQUEST_BYTES,
  fetch: app.fetch,
};

export { app };
