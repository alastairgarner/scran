/**
 * The invite routes, and the whole of the security argument they carry:
 * **GET renders, POST redeems**. Chat apps and mail scanners fetch a link
 * before a human ever taps it, and RFC 9110 §9.2.1 says a safe method must not
 * perform an unsafe action — so a previewer hitting this URL burns nothing.
 */
import { zValidator } from '@hono/zod-validator';
import { signUpSchema } from '@scran/shared';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

import { readInvite, redeemInvite } from '../auth';
import { ClientError } from '../errors';

/**
 * `hono/csrf` ignores JSON entirely — correctly, since a browser cannot send
 * cross-origin JSON without a preflight nothing here approves. Demanding JSON
 * closes the other half: `text/plain` is form-shaped enough to be sent
 * cross-origin, so it is rejected before anything reads the body.
 */
const requireJson: MiddlewareHandler = async (c, next) => {
  if (!c.req.header('content-type')?.startsWith('application/json')) {
    throw ClientError.validation('Send JSON.');
  }
  await next();
};

export const invites = new Hono();

/** The landing page's data. Idempotent, so N previewer hits are harmless. */
invites.get('/api/invites/:token', c =>
  c.json(readInvite(c.req.param('token'))),
);

invites.post(
  '/api/invites/:token',
  requireJson,
  zValidator('json', signUpSchema),
  async c => {
    const headers = await redeemInvite(
      c.req.param('token'),
      c.req.valid('json'),
    );
    // Redeeming signs you in: Better Auth's `Set-Cookie` rides back on our
    // response rather than costing a second round trip to a login form.
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify({ ok: true }), { status: 201, headers });
  },
);
