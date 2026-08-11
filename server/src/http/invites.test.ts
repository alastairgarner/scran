import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import { auth, createInvite, requireUser } from '../auth';
import { db } from '../db';
import { errorHandler } from '../errors';
import { app } from '../index';
import { signUpThroughInvite } from '../testing';

/** @returns {string} The raw token out of a signup URL. */
const tokenFrom = (url: string) => url.split('/').pop() as string;

const signUp = (token: string, body: Record<string, string>) =>
  app.request(`/api/invites/${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const person = {
  name: 'Nan',
  email: 'nan@scran.test',
  password: 'hunter2222',
};

/** @returns {number} How many accounts exist. */
const accountCount = () =>
  (db.query('SELECT count(*) AS n FROM "user"').get() as { n: number }).n;

describe('redeeming an invite', () => {
  it('creates exactly one account, and only once', async () => {
    // Arrange
    const before = accountCount();
    const token = tokenFrom(createInvite());

    // Act
    const first = await signUp(token, person);
    const second = await signUp(token, {
      ...person,
      email: 'other@scran.test',
    });

    // Assert
    expect(first.status).toBe(201);
    expect(second.status).toBe(404);
    expect(accountCount()).toBe(before + 1);
  });

  it('signs you straight in, with a session that outlives the process', async () => {
    // Arrange
    const token = tokenFrom(createInvite());

    // Act
    const response = await signUp(token, {
      ...person,
      email: 'session@scran.test',
    });

    // Assert: the cookie is the session, and the session is a database row —
    // which is what makes it survive a restart rather than any in-memory map.
    const cookies = response.headers.getSetCookie();
    expect(cookies.join()).toContain('better-auth.session_token');
    expect(cookies.join()).toContain('HttpOnly');
    expect(cookies.join()).toContain('SameSite=Lax');
    const cookie = cookies.map(header => header.split(';')[0]).join('; ');
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.email).toBe('session@scran.test');
    expect(
      (db.query('SELECT count(*) AS n FROM session').get() as { n: number }).n,
    ).toBeGreaterThan(0);
  });

  it('stores the token hashed, so the database is not a pile of invites', () => {
    // Arrange & act
    const token = tokenFrom(createInvite());

    // Assert
    const rows = db.query('SELECT tokenHash FROM invite').all() as {
      tokenHash: string;
    }[];
    expect(rows.map(row => row.tokenHash)).not.toContain(token);
  });

  it('refuses an expired invite', async () => {
    // Arrange
    const token = tokenFrom(createInvite('expired@scran.test'));
    db.run(
      `UPDATE invite SET expiresAt = '2020-01-01T00:00:00.000Z'
       WHERE id = (SELECT max(id) FROM invite)`,
    );

    // Act
    const response = await signUp(token, {
      ...person,
      email: 'expired@scran.test',
    });

    // Assert
    expect(response.status).toBe(404);
  });

  it('holds an invite to the address it was issued to', async () => {
    // Arrange
    const token = tokenFrom(createInvite('bound@scran.test'));

    // Act
    const wrong = await signUp(token, {
      ...person,
      email: 'someone-else@scran.test',
    });
    const right = await signUp(token, { ...person, email: 'bound@scran.test' });

    // Assert: the failed attempt must not have burned it.
    expect(wrong.status).toBe(400);
    expect(right.status).toBe(201);
  });

  it('rejects a cross-origin form-shaped post at the CSRF layer', async () => {
    // Arrange
    const token = tokenFrom(createInvite());

    // Act: `text/plain` is one of the three content types a form can send
    // cross-origin without a preflight, so `hono/csrf` inspects it.
    const response = await app.request(`/api/invites/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'https://evil.test' },
      body: JSON.stringify(person),
    });

    // Assert
    expect(response.status).toBe(403);
  });

  it('rejects a body that is not JSON even from our own origin', async () => {
    // Arrange
    const token = tokenFrom(createInvite());

    // Act: past CSRF, the content type still has to be one the API accepts —
    // the two layers cover different halves and both are needed.
    const response = await app.request(`/api/invites/${token}`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify(person),
    });

    // Assert
    expect(response.status).toBe(400);
  });

  it('rejects a half-filled form', async () => {
    // Arrange
    const token = tokenFrom(createInvite());

    // Act
    const response = await signUp(token, { ...person, password: 'short' });

    // Assert
    expect(response.status).toBe(400);
  });
});

describe('looking an invite up', () => {
  it('burns nothing, however many previewers fetch it', async () => {
    // Arrange
    const token = tokenFrom(createInvite('previewed@scran.test'));

    // Act
    const first = await app.request(`/api/invites/${token}`);
    await app.request(`/api/invites/${token}`);
    const redeemed = await signUp(token, {
      ...person,
      email: 'previewed@scran.test',
    });

    // Assert
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ email: 'previewed@scran.test' });
    expect(redeemed.status).toBe(201);
  });

  it('says the same thing for used, expired and invented tokens', async () => {
    // Arrange & act
    const response = await app.request('/api/invites/never-existed');

    // Assert
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error:
        'This invite has already been used, or it has expired. Ask whoever sent it for a new one.',
    });
  });
});

describe('the way in', () => {
  it('does not expose Better Auth’s own sign-up endpoint', async () => {
    // Arrange & act
    const response = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(person),
    });

    // Assert: an invite is the only way in.
    expect(response.status).toBe(404);
  });

  it('signs an invited person in again with their password', async () => {
    // Arrange
    const { email } = await signUpThroughInvite('returning@scran.test');

    // Act
    const response = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'hunter2222' }),
    });

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join()).toContain(
      'better-auth.session_token',
    );
  });
});

describe('requireUser', () => {
  const guarded = new Hono<AppEnv>();
  guarded.get('/who', requireUser, c => c.json({ email: c.get('user').email }));
  guarded.onError(errorHandler);

  it('turns an anonymous request away', async () => {
    // Arrange & act
    const response = await guarded.request('/who');

    // Assert
    expect(response.status).toBe(401);
  });

  it('hands the route the person behind the cookie', async () => {
    // Arrange
    const { cookie, email } = await signUpThroughInvite('guarded@scran.test');

    // Act
    const response = await guarded.request('/who', { headers: { cookie } });

    // Assert
    expect(await response.json()).toEqual({ email });
  });
});
