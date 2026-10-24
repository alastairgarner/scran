import { zValidator } from '@hono/zod-validator';
import { createInviteSchema } from '@scran/shared';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../auth';
import {
  accountRole,
  createInvite,
  disableAccountById,
  enableAccountById,
  listAccounts,
  listInvites,
  requireAdmin,
  requireUser,
  revokeAccountSessions,
  revokeInvite,
} from '../auth';
import { ClientError } from '../errors';
import { requireJson } from './invites';

const accountIdSchema = z.object({ id: z.string().trim().min(1).max(200) });
const inviteIdSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().safe()),
});
const emptyBody = z.object({}).strict();

// Keep registration chained: the client consumes the inferred Hono RPC type.
const account = new Hono<AppEnv>().get('/api/account', requireUser, c =>
  c.json({ role: accountRole(c.get('user').id) }),
);
const admin = new Hono<AppEnv>()
  .use('/api/admin/*', requireUser, requireAdmin)
  .get('/api/admin/accounts', c => c.json(listAccounts()))
  .post(
    '/api/admin/accounts/:id/disable',
    requireJson,
    zValidator('param', accountIdSchema),
    zValidator('json', emptyBody),
    async c => {
      await disableAccountById(c.req.valid('param').id, c.get('user').id);
      return c.json({ ok: true as const });
    },
  )
  .post(
    '/api/admin/accounts/:id/enable',
    requireJson,
    zValidator('param', accountIdSchema),
    zValidator('json', emptyBody),
    c => {
      enableAccountById(c.req.valid('param').id, c.get('user').id);
      return c.json({ ok: true as const });
    },
  )
  .post(
    '/api/admin/accounts/:id/revoke-sessions',
    requireJson,
    zValidator('param', accountIdSchema),
    zValidator('json', emptyBody),
    async c => {
      await revokeAccountSessions(c.req.valid('param').id, c.get('user').id);
      return c.json({ ok: true as const });
    },
  )
  .get('/api/admin/invites', c => c.json(listInvites()))
  .post(
    '/api/admin/invites',
    requireJson,
    zValidator('json', createInviteSchema),
    c => {
      return c.json({
        url: createInvite(c.req.valid('json').email, c.get('user').id),
      });
    },
  )
  .post(
    '/api/admin/invites/:id/revoke',
    requireJson,
    zValidator('param', inviteIdSchema),
    zValidator('json', emptyBody),
    c => {
      if (!revokeInvite(c.req.valid('param').id, c.get('user').id)) {
        throw ClientError.notFound('Pending invite not found.');
      }
      return c.json({ ok: true as const });
    },
  );

export const managementRoutes = account.route('/', admin);
