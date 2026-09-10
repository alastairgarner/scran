import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { requestId } from 'hono/request-id';

import { auth, migrateAuth } from './auth';
import { config } from './config';
import { db, migrate } from './db';
import { ClientError, errorHandler } from './errors';
import { invites } from './http/invites';
import { recipeRoutes } from './http/recipes';
import { logger } from './logger';
import { sweepStalePending, syncTagSearch } from './recipes';

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

// Told its origin explicitly rather than inferring one from `Host`, which a
// reverse proxy can rewrite. Covers the form-shaped requests CORS cannot.
app.use('*', csrf({ origin: config.baseUrl }));

app.use('*', async (c, next) => {
  const startedAt = performance.now();
  await next();
  logger.info(
    {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
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
const routes = app.route('/', invites).route('/', recipeRoutes);

/** The client's view of this server: every endpoint, typed. */
export type AppType = typeof routes;

// One boundary for every route. Nothing catches below this.
app.onError(errorHandler);

logger.info({ port: config.port, baseUrl: config.baseUrl }, 'scran listening');

export default {
  port: config.port,
  fetch: app.fetch,
};

export { app };
