import { beforeAll, describe, expect, it } from 'bun:test';

import {
  activeSession,
  auth,
  createInvite,
  disableAccount,
  enableAccount,
  listAccounts,
  listInvites,
  migrateAuth,
  readInvite,
  redeemInvite,
  resetPassword,
  revokeInvite,
} from './auth';
import { config } from './config';
import { db, migrate } from './db';
import { ClientError } from './errors';

const PASSWORD = 'correct-horse-battery';

beforeAll(async () => {
  migrate(db);
  await migrateAuth();
});

/** Straight at Better Auth, the way the browser reaches it. */
const authRequest = (
  path: string,
  {
    headers,
    ...init
  }: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
) =>
  auth.handler(
    new Request(`${config.baseUrl}/api/auth${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        origin: config.baseUrl,
        ...headers,
      },
    }),
  );

const cookieFrom = (headers: Headers) =>
  headers
    .getSetCookie()
    .map(header => header.split(';')[0])
    .join('; ');

let count = 0;

/** @returns A fresh synthetic account and the cookie of its first session. */
async function account() {
  const email = `security-${++count}@scran.test`;
  const token = new URL(createInvite(email)).pathname.split('/').pop() ?? '';
  const headers = await redeemInvite(token, {
    name: 'Synthetic',
    email,
    password: PASSWORD,
  });
  return { email, cookie: cookieFrom(headers) };
}

let address = 0;

/** Each from its own client address, so sign-in's rate limit stays out of it. */
const signIn = (email: string, password = PASSWORD) =>
  authRequest('/sign-in/email', {
    method: 'POST',
    headers: { [config.authIpHeader]: `198.51.100.${++address}` },
    body: JSON.stringify({ email, password }),
  });

const sessionOf = async (cookie: string) =>
  (await authRequest('/get-session', { headers: { cookie } })).json();

const sessionCount = (email: string) =>
  db
    .query<{ n: number }, [string]>(
      'SELECT count(*) AS n FROM session s JOIN "user" u ON u.id = s.userId WHERE u.email = ?',
    )
    .get(email)?.n;

describe('disabling an account', () => {
  it('ends existing sessions, blocks new sign-ins, and keeps the account', async () => {
    // Arrange
    const { email, cookie } = await account();
    expect(await sessionOf(cookie)).not.toBeNull();

    // Act
    await disableAccount(email);
    const attempt = await signIn(email);

    // Assert
    expect(await sessionOf(cookie)).toBeNull();
    expect(await activeSession(new Headers({ cookie }))).toBeNull();
    expect(attempt.status).toBe(403);
    expect(attempt.headers.getSetCookie()).toHaveLength(0);
    expect(sessionCount(email)).toBe(0);
    expect(
      listAccounts().find(row => row.email === email)?.disabledAt,
    ).toBeString();
  });

  it('atomically rejects a stale sign-in session insert after another process disables the account', async () => {
    const { email } = await account();
    const userId = listAccounts().find(row => row.email === email)?.id;
    if (!userId) {
      throw new Error('Missing synthetic account.');
    }
    await disableAccount(email);
    expect(() =>
      db.run(
        'INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [
          'racing-session',
          'racing-token',
          userId,
          new Date(Date.now() + 60_000).toISOString(),
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      ),
    ).toThrow('Account disabled');
    expect(sessionCount(email)).toBe(0);
  });

  it('lets a re-enabled account sign in again', async () => {
    // Arrange
    const { email } = await account();
    await disableAccount(email);

    // Act
    enableAccount(email);
    const attempt = await signIn(email);

    // Assert
    expect(attempt.status).toBe(200);
    expect(await sessionOf(cookieFrom(attempt.headers))).not.toBeNull();
  });
});

describe('an operator password reset', () => {
  it('keeps the user id, replaces the password and signs out everywhere', async () => {
    // Arrange
    const { email, cookie } = await account();
    const id = listAccounts().find(row => row.email === email)?.id;

    // Act
    const temporary = await resetPassword(email);

    // Assert
    expect(temporary.length).toBeGreaterThanOrEqual(12);
    expect(await sessionOf(cookie)).toBeNull();
    expect((await signIn(email)).status).toBe(401);
    const fresh = await signIn(email, temporary);
    expect(fresh.status).toBe(200);
    expect((await fresh.json()).user.id).toBe(id);
  });
});

describe('changing a password', () => {
  it('signs out other devices even when the client asks it not to', async () => {
    // Arrange
    const { email, cookie: other } = await account();
    const current = cookieFrom((await signIn(email)).headers);

    // Act
    const response = await authRequest('/change-password', {
      method: 'POST',
      headers: { cookie: current },
      body: JSON.stringify({
        currentPassword: PASSWORD,
        newPassword: 'another-long-password',
        revokeOtherSessions: false,
      }),
    });

    // Assert
    expect(response.status).toBe(200);
    expect(await sessionOf(other)).toBeNull();
    expect(await sessionOf(cookieFrom(response.headers))).not.toBeNull();
    expect((await signIn(email, 'another-long-password')).status).toBe(200);
  });

  it('refuses a new password under twelve characters', async () => {
    // Arrange
    const { cookie } = await account();

    // Act
    const response = await authRequest('/change-password', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({
        currentPassword: PASSWORD,
        newPassword: 'elevenchars',
      }),
    });

    // Assert
    expect(response.status).toBe(400);
  });
});

describe('revoking an invite', () => {
  it('kills an unused invite and drops it from the list', async () => {
    // Arrange
    const token = new URL(createInvite('revoked@scran.test')).pathname
      .split('/')
      .pop();
    const invite = listInvites().find(
      row => row.email === 'revoked@scran.test',
    );
    if (!token || !invite) {
      throw new Error('The invite was not created.');
    }

    // Act
    const revoked = revokeInvite(invite.id);

    // Assert
    expect(revoked).toBeTrue();
    expect(revokeInvite(invite.id)).toBeFalse();
    expect(listInvites().some(row => row.id === invite.id)).toBeFalse();
    expect(() => readInvite(token)).toThrow();
    const redeemed = await redeemInvite(token, {
      name: 'Late',
      email: 'revoked@scran.test',
      password: PASSWORD,
    }).catch((cause: unknown) => cause);
    expect(redeemed).toBeInstanceOf(ClientError);
  });

  it('leaves a redeemed invite alone', async () => {
    // Arrange
    await account();
    const { id } = db
      .query<{ id: number }, []>(
        'SELECT id FROM invite WHERE redeemedAt IS NOT NULL LIMIT 1',
      )
      .get() ?? { id: 0 };

    // Act & assert
    expect(revokeInvite(id)).toBeFalse();
  });
});
