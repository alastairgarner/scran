/**
 * Better Auth, and the invite layer on top of it — ticket 01's decision, built.
 *
 * The division of labour: Better Auth owns credentials and sessions (its four
 * tables are a vendor island, migrated by its own migrator, never by ours), and
 * the `invite` table is ours. Nothing else in the codebase knows how either
 * works; routes get `requireUser` and the two invite functions.
 */
import { createHash, randomBytes } from 'node:crypto';

import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import type { MiddlewareHandler } from 'hono';

import { config } from './config';
import { db } from './db';
import { AppError, ClientError } from './errors';

const DAY_IN_SECONDS = 60 * 60 * 24;
/** Idle timeout. Rolling, so a phone cooked from monthly never logs out. */
const SESSION_LIFETIME_SECONDS = DAY_IN_SECONDS * 180;
/** Long enough to survive a weekend of ignored phones, short enough to rot. */
const INVITE_LIFETIME_MS = DAY_IN_SECONDS * 7 * 1000;

export const auth = betterAuth({
  database: db,
  baseURL: config.baseUrl,
  basePath: '/api/auth',
  secret: config.authSecret,
  emailAndPassword: {
    // The only credential this map ships. Passkeys need a hostname, and a LAN
    // IP is not one — they arrive with the public deploy, purely additively.
    enabled: true,
  },
  session: {
    expiresIn: SESSION_LIFETIME_SECONDS,
    // Refresh at most daily: the cookie and the row both extend, the token is
    // not rotated. No absolute cap — one would contradict the idle timeout.
    updateAge: DAY_IN_SECONDS,
    // Must be 0. `freshAge` is measured from session *creation*, so with a
    // six-month rolling session every session is permanently stale after day
    // one and every endpoint behind the freshness check 403s forever.
    freshAge: 0,
  },
  advanced: {
    cookiePrefix: config.authCookiePrefix,
    // `Secure` cookies need a secure context, which `http://192.168.x.x` is
    // not. One env var, flipped at deploy time, no code change.
    useSecureCookies: config.cookieSecure,
  },
  rateLimit: {
    // Set explicitly because the documented defaults are wrong: the real
    // window in the source is 10 seconds, and it is off outside production.
    enabled: true,
    window: 60,
    max: 100,
  },
});

/** The signed-in person, as Better Auth models them. */
export type User = typeof auth.$Infer.Session.user;

/** What `requireUser` puts on the context for every route below it. */
export type AppEnv = { Variables: { user: User } };

/**
 * Creates Better Auth's own tables, using its migrator rather than a numbered
 * `.sql` file of ours — the vendor island ticket 04 asked for. Idempotent, so
 * boot repeats it happily, and an in-memory test database gets them for free.
 */
export async function migrateAuth(): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}

/**
 * Rejects anonymous requests before a route sees them, and hands every route
 * below it the signed-in person. The client's copy of the session is for
 * drawing; this is the only thing that decides access.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    throw ClientError.unauthorised('Sign in to continue.');
  }
  c.set('user', session.user);
  await next();
};

/** Stored hashed, so the database alone is not a pile of working invites. */
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/**
 * Mints an invite. The set of unredeemed invites is the entire allow-list —
 * there is no other way to get an account.
 *
 * @returns {string} The signup URL, built from `BASE_URL` rather than any
 *   request header, and the only time the raw token exists anywhere.
 */
export function createInvite(email?: string, createdByUserId?: string): string {
  // 256 bits, the same as a session token. Brute force is not a thing here.
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  db.run(
    `INSERT INTO invite (tokenHash, email, expiresAt, createdByUserId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      hashToken(token),
      email ?? null,
      new Date(now.getTime() + INVITE_LIFETIME_MS).toISOString(),
      createdByUserId ?? null,
      now.toISOString(),
      now.toISOString(),
    ],
  );
  return `${config.baseUrl}/invite/${token}`;
}

/**
 * Looks an invite up without touching it, so the landing page — and every link
 * previewer that fetches the URL before a human taps it — burns nothing.
 *
 * @returns {{ email: string | null }} The address it was bound to, if any, so
 *   the form can prefill it.
 * @throws {ClientError} 404 when the token is used, expired or invented. The
 *   three are deliberately indistinguishable.
 */
export function readInvite(token: string): { email: string | null } {
  const invite = db
    .query(
      `SELECT email FROM invite
       WHERE tokenHash = ? AND redeemedAt IS NULL AND expiresAt > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as
    | { email: string | null }
    | undefined;
  if (!invite) {
    throw ClientError.notFound(
      'This invite has already been used, or it has expired. Ask whoever sent it for a new one.',
    );
  }
  return invite;
}

type SignUp = { name: string; email: string; password: string };

/**
 * Burns an invite and creates the account it paid for. Called only by a POST:
 * this is the one operation a link previewer must never be able to trigger.
 *
 * The burn is a single conditional UPDATE, so two people tapping the same link
 * at once cannot both get in — the loser gets no row back. It happens *before*
 * the account is created and is undone if creation fails, because the opposite
 * order lets a lost race create an account with no invite behind it.
 *
 * @returns {Headers} Better Auth's response headers, carrying the session
 *   cookie — redeeming signs you straight in.
 * @throws {ClientError} 404 for a dead token, 409 for an address already used.
 */
export async function redeemInvite(
  token: string,
  signUp: SignUp,
): Promise<Headers> {
  const now = new Date().toISOString();
  const burned = db
    .query(
      `UPDATE invite SET redeemedAt = ?, updatedAt = ?
       WHERE tokenHash = ? AND redeemedAt IS NULL AND expiresAt > ?
       RETURNING id, email`,
    )
    .get(now, now, hashToken(token), now) as
    | { id: number; email: string | null }
    | undefined;
  if (!burned) {
    throw ClientError.notFound(
      'This invite has already been used, or it has expired. Ask whoever sent it for a new one.',
    );
  }

  const release = () =>
    db.run('UPDATE invite SET redeemedAt = NULL, updatedAt = ? WHERE id = ?', [
      new Date().toISOString(),
      burned.id,
    ]);

  // An invite bound to an address is bound to it. Otherwise forwarding the
  // link would hand the account to whoever opened it first.
  if (
    burned.email &&
    burned.email.toLowerCase() !== signUp.email.toLowerCase()
  ) {
    release();
    throw ClientError.validation(
      'This invite is for a different email address.',
    );
  }

  try {
    const { headers, response } = await auth.api.signUpEmail({
      body: signUp,
      returnHeaders: true,
    });
    db.run(
      'UPDATE invite SET redeemedByUserId = ?, updatedAt = ? WHERE id = ?',
      [response.user.id, new Date().toISOString(), burned.id],
    );
    return headers;
  } catch (cause) {
    release();
    // Better Auth throws its own APIError with a status; the only one the
    // caller can act on is the duplicate address.
    const status = (cause as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      throw ClientError.conflict(
        'That email address already has an account.',
        { email: signUp.email },
        cause,
      );
    }
    throw AppError.internal('Could not create the account.', {}, cause);
  }
}
