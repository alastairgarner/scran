import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { config } from './config';
import { db, migrate } from './db';
import { errorHandler } from './errors';
import { logger } from './logger';

const applied = migrate(db);
if (applied.length > 0) {
  logger.info({ migrations: applied }, 'Applied migrations');
}

const app = new Hono();

app.use('*', requestId());

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

// One boundary for every route. Nothing catches below this.
app.onError(errorHandler);

logger.info({ port: config.port, baseUrl: config.baseUrl }, 'scran listening');

export default {
  port: config.port,
  fetch: app.fetch,
};

export { app };
