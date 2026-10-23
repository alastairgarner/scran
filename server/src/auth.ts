/**
 * Better Auth, and the invite layer on top of it — ticket 01's decision, built.
 *
 * The division of labour: Better Auth owns credentials and sessions (its four
 * tables are a vendor island, migrated by its own migrator, never by ours), and
 * the `invite` table is ours. Nothing else in the codebase knows how either
 * works; routes get `requireUser` and the two invite functions.
 */
import { createHash, randomBytes } from 'node:crypto';

import { PASSWORD_MIN_LENGTH } from '@scran/shared';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
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

const isDisabled = (userId: string) =>
  db.query('SELECT 1 FROM disabledAccount WHERE userId = ?').get(userId) !==
  null;

export const auth = betterAuth({
  database: db,
  baseURL: config.baseUrl,
  basePath: '/api/auth',
  secret: config.authSecret,
  emailAndPassword: {
    // The only credential this map ships. Passkeys need a hostname, and a LAN
    // IP is not one — they arrive with the public deploy, purely additively.
    enabled: true,
    // Sign-in checks no length, so passwords set under the old floor still work.
    minPasswordLength: PASSWORD_MIN_LENGTH,
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
    // Trust one header only, overwritten by the isolated reverse proxy. The
    // default preserves existing direct-Caddy installs; never expose Bun itself.
    ipAddress: { ipAddressHeaders: [config.authIpHeader] },
  },
  hooks: {
    // Changing a password signs out every other device, whatever the client
    // asked for: a leaked password's sessions must not outlive it.
    before: createAuthMiddleware(async ctx => {
      if (ctx.path === '/change-password') {
        // Merged deeply into the request, so the rest of the body survives.
        return { context: { body: { revokeOtherSessions: true } } };
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        // Every way in — sign-in, signup, a password change's fresh session —
        // creates a session row, so this one check covers them all. Existing
        // sessions are deleted by `disableAccount` itself.
        before: async session => {
          if (isDisabled(session.userId)) {
            throw new APIError('FORBIDDEN', {
              message: 'This account has been disabled.',
            });
          }
        },
      },
    },
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
  // The CLI disables accounts in another process. Enforce the final check in
  // SQLite itself, atomically with INSERT, not just in the async auth hook.
  db.run(`CREATE TRIGGER IF NOT EXISTS rejectDisabledAccountSession
    BEFORE INSERT ON session
    WHEN EXISTS (SELECT 1 FROM disabledAccount WHERE userId = NEW.userId)
    BEGIN
      SELECT RAISE(ABORT, 'Account disabled');
    END`);
}

/**
 * The request's session, unless its account is disabled. Disabling deletes
 * every session, so the check is a backstop for a race, not the mechanism.
 */
export async function activeSession(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session && !isDisabled(session.user.id) ? session : null;
}

/**
 * Rejects anonymous requests before a route sees them, and hands every route
 * below it the signed-in person. The client's copy of the session is for
 * drawing; this is the only thing that decides access.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await activeSession(c.req.raw.headers);
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
       WHERE tokenHash = ? AND redeemedAt IS NULL AND revokedAt IS NULL
         AND expiresAt > ?`,
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
       WHERE tokenHash = ? AND redeemedAt IS NULL AND revokedAt IS NULL
         AND expiresAt > ?
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

  // Email binding limits the account address, not the person holding the
  // bearer link. Mailbox ownership is intentionally not verified here.
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

// Operator controls, run from the CLI by whoever holds the server's database.
// There is no admin role: shell access to the box is the authority.

type PendingInvite = {
  id: number;
  email: string | null;
  createdAt: string;
  expiresAt: string;
};

/** @returns {PendingInvite[]} Invites that could still create an account. */
export function listInvites(): PendingInvite[] {
  return db
    .query<PendingInvite, [string]>(
      `SELECT id, email, createdAt, expiresAt FROM invite
       WHERE redeemedAt IS NULL AND revokedAt IS NULL AND expiresAt > ?
       ORDER BY id`,
    )
    .all(new Date().toISOString());
}

/**
 * Kills an unused invite. Kept rather than deleted, so the row still says who
 * was invited and when.
 *
 * @returns {boolean} Whether an unused invite with that id existed.
 */
export function revokeInvite(id: number): boolean {
  const now = new Date().toISOString();
  return (
    db.run(
      `UPDATE invite SET revokedAt = ?, updatedAt = ?
       WHERE id = ? AND redeemedAt IS NULL AND revokedAt IS NULL`,
      [now, now, id],
    ).changes > 0
  );
}

type Account = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  disabledAt: string | null;
};

/** @returns {Account[]} Every account, disabled ones included. */
export function listAccounts(): Account[] {
  return db
    .query<Account, []>(
      `SELECT u.id, u.name, u.email, u.createdAt, d.disabledAt
       FROM "user" u LEFT JOIN disabledAccount d ON d.userId = u.id
       ORDER BY u.createdAt`,
    )
    .all();
}

/** @throws {ClientError} 404 when no account has that address. */
function accountId(email: string): string {
  const row = db
    .query<{ id: string }, [string]>('SELECT id FROM "user" WHERE email = ?')
    .get(email.toLowerCase());
  if (!row) {
    throw ClientError.notFound(`No account for ${email}.`);
  }
  return row.id;
}

/**
 * Locks an account out and signs out every device. The user row stays, so the
 * recipes and versions they wrote keep their attribution. The flag goes in
 * first. A SQLite trigger also rejects a racing INSERT from another process.
 */
export async function disableAccount(email: string): Promise<void> {
  const userId = accountId(email);
  db.run(
    'INSERT OR IGNORE INTO disabledAccount (userId, disabledAt) VALUES (?, ?)',
    [userId, new Date().toISOString()],
  );
  await (await auth.$context).internalAdapter.deleteUserSessions(userId);
}

/** Lets a disabled account sign in again. Its old sessions stay gone. */
export function enableAccount(email: string): void {
  db.run('DELETE FROM disabledAccount WHERE userId = ?', [accountId(email)]);
}

/**
 * Replaces a forgotten password with a random one for the operator to pass
 * on, and signs out every device. Same user id, so nothing they wrote moves.
 * Hashed by Better Auth's own hasher, so sign-in verifies it like any other.
 *
 * @returns {string} The temporary password — the only time it exists.
 */
export async function resetPassword(email: string): Promise<string> {
  const userId = accountId(email);
  const context = await auth.$context;
  const account = (await context.internalAdapter.findAccounts(userId)).find(
    candidate => candidate.providerId === 'credential',
  );
  if (!account) {
    throw ClientError.notFound(`${email} has no password to reset.`);
  }
  // 96 bits, base64url: 16 characters, over the floor and easy to read out.
  const password = randomBytes(12).toString('base64url');
  await context.internalAdapter.updatePassword(
    userId,
    await context.password.hash(password),
  );
  await context.internalAdapter.deleteUserSessions(userId);
  return password;
}
