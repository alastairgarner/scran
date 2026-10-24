import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  accountRole,
  activeSession,
  auth,
  createInvite,
  disableAccount,
  disableAccountById,
  enableAccountById,
  listAccounts,
  listInvites,
  makeAdmin,
  resetPassword,
  revokeAccountSessions,
} from '../auth';
import { config } from '../config';
import { db } from '../db';
import { app } from '../index';
import { signUpThroughInvite } from '../testing';

let admin: Awaited<ReturnType<typeof signUpThroughInvite>>;
let member: Awaited<ReturnType<typeof signUpThroughInvite>>;
let adminId: string;
let memberId: string;
const idFor = (email: string) => {
  const found = listAccounts().find(row => row.email === email);
  if (!found) {
    throw new Error('Missing test account');
  }
  return found.id;
};
const request = (path: string, cookie = admin.cookie, body?: unknown) =>
  app.request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map(value => value.split(';')[0])
    .join('; ');
let ip = 10;
const signIn = (email: string) =>
  app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [config.authIpHeader]: `203.0.113.${++ip}`,
    },
    body: JSON.stringify({ email, password: 'hunter22222222' }),
  });

beforeAll(async () => {
  admin = await signUpThroughInvite('management-admin@scran.test');
  member = await signUpThroughInvite('management-member@scran.test');
  adminId = idFor(admin.email);
  memberId = idFor(member.email);
});
afterAll(() => {
  db.run('DELETE FROM accountAccess WHERE userId = ?', [adminId]);
});

describe('operator bootstrap', () => {
  it('requires an existing enabled account; upgrades the current session immediately', async () => {
    expect(() => makeAdmin('missing@scran.test')).toThrow('No account');
    const disabled = await signUpThroughInvite(
      'management-disabled@scran.test',
    );
    await disableAccount(disabled.email);
    expect(() => makeAdmin(disabled.email)).toThrow('Enable this account');
    expect(await (await request('/api/account')).json()).toEqual({
      role: 'member',
    });
    expect((await request('/api/admin/accounts')).status).toBe(403);
    makeAdmin(admin.email.toUpperCase());
    makeAdmin(admin.email);
    expect(await (await request('/api/account')).json()).toEqual({
      role: 'admin',
    });
    expect((await request('/api/admin/accounts')).status).toBe(200);
    expect(() => makeAdmin(member.email)).toThrow('already exists');
  });

  it('enforces single-admin uniqueness at the database boundary', () => {
    expect(() =>
      db.run("INSERT INTO accountAccess (userId, role) VALUES (?, 'admin')", [
        memberId,
      ]),
    ).toThrow();
    expect(() =>
      db.run('INSERT INTO disabledAccount (userId, disabledAt) VALUES (?, ?)', [
        adminId,
        new Date().toISOString(),
      ]),
    ).toThrow('administrator cannot be disabled');
  });

  it('CLI is idempotent, case insensitive, rejects another admin even if the old admin is disabled', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'scran-admin-cli-'));
    const path = join(directory, 'test.db');
    // A real migrated file database, including real Better Auth accounts.
    db.run('VACUUM INTO ?', [path]);
    const copy = new Database(path);
    const run = async (...args: string[]) => {
      const child = Bun.spawn(['bun', 'run', 'accounts', ...args], {
        cwd: join(import.meta.dir, '../../..'),
        env: { ...process.env, DATABASE_URL: path },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stdout, stderr, exit };
    };
    try {
      expect((await run('make-admin', admin.email.toUpperCase())).exit).toBe(0);
      expect((await run('make-admin', 'missing@scran.test')).exit).toBe(1);
      expect((await run('make-admin', member.email)).exit).toBe(1);
      expect((await run('disable', admin.email)).exit).toBe(1);
      // Simulate legacy/corrupt disabled admin data. No bootstrap takeover.
      copy.run('DROP TRIGGER protectAdminFromDisable');
      copy.run('INSERT INTO disabledAccount VALUES (?, ?)', [
        adminId,
        new Date().toISOString(),
      ]);
      expect((await run('make-admin', member.email)).exit).toBe(1);
      expect((await run('make-admin', admin.email)).exit).toBe(1);
      copy.run('DELETE FROM accountAccess');
      expect((await run('make-admin', admin.email)).exit).toBe(1);
      expect((await run('make-admin', member.email)).exit).toBe(0);
    } finally {
      copy.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('admin HTTP boundary', () => {
  it('denies anonymous and members on every admin endpoint', async () => {
    const endpoints: [string, unknown?][] = [
      ['/api/admin/accounts'],
      ['/api/admin/invites'],
      [`/api/admin/accounts/${memberId}/disable`, {}],
      [`/api/admin/accounts/${memberId}/enable`, {}],
      [`/api/admin/accounts/${memberId}/revoke-sessions`, {}],
      ['/api/admin/invites', { email: 'denied@scran.test' }],
      ['/api/admin/invites/1/revoke', {}],
    ];
    expect((await request('/api/account', '')).status).toBe(401);
    expect(await (await request('/api/account', member.cookie)).json()).toEqual(
      { role: 'member' },
    );
    for (const [path, body] of endpoints) {
      expect((await request(path, '', body)).status).toBe(401);
      expect((await request(path, member.cookie, body)).status).toBe(403);
    }
  });

  it('uses fresh role data on the same cookie', async () => {
    db.run("UPDATE accountAccess SET role = 'member' WHERE userId = ?", [
      adminId,
    ]);
    try {
      expect((await request('/api/admin/accounts')).status).toBe(403);
      expect(await (await request('/api/account')).json()).toEqual({
        role: 'member',
      });
    } finally {
      makeAdmin(admin.email);
    }
    expect((await request('/api/admin/accounts')).status).toBe(200);
  });

  it('validates JSON, CSRF, email, IDs and bodies without changing data', async () => {
    const path = `/api/admin/accounts/${memberId}/disable`;
    const auditCount = () =>
      db
        .query<{ n: number }, []>('SELECT count(*) n FROM managementAudit')
        .get()?.n;
    const before = auditCount();
    for (const [origin, status] of [
      [config.baseUrl, 400],
      ['https://evil.test', 403],
    ] satisfies [string, number][]) {
      const response = await app.request(path, {
        method: 'POST',
        headers: { cookie: admin.cookie, 'content-type': 'text/plain', origin },
        body: '{}',
      });
      expect(response.status).toBe(status);
    }
    expect((await request(path, admin.cookie, { role: 'admin' })).status).toBe(
      400,
    );
    expect(
      (await request('/api/admin/invites', admin.cookie, { email: 'bad' }))
        .status,
    ).toBe(400);
    expect(
      (
        await request('/api/admin/invites', admin.cookie, {
          email: 'valid@scran.test',
          role: 'admin',
        })
      ).status,
    ).toBe(400);
    expect(
      (await request('/api/admin/invites/1x/revoke', admin.cookie, {})).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/admin/invites/9007199254740992/revoke',
          admin.cookie,
          {},
        )
      ).status,
    ).toBe(400);
    expect(
      (await request('/api/admin/accounts/missing/enable', admin.cookie, {}))
        .status,
    ).toBe(404);
    const malformed = await app.request(path, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(auditCount()).toBe(before);
    expect(
      listAccounts().find(row => row.id === memberId)?.disabledAt,
    ).toBeNull();
  });

  it('prevents disabling the administrator via HTTP and CLI domain control', async () => {
    expect(
      (
        await request(
          `/api/admin/accounts/${adminId}/disable`,
          admin.cookie,
          {},
        )
      ).status,
    ).toBe(409);
    expect(disableAccount(admin.email)).rejects.toThrow(
      'administrator cannot be disabled',
    );
    expect(
      await activeSession(new Headers({ cookie: admin.cookie })),
    ).not.toBeNull();
  });

  it('disables, signs out, preserves attribution and re-enables without restoring old sessions', async () => {
    expect(
      (
        await request(
          `/api/admin/accounts/${memberId}/disable`,
          admin.cookie,
          {},
        )
      ).status,
    ).toBe(200);
    expect((await request('/api/account', member.cookie)).status).toBe(401);
    expect((await signIn(member.email)).status).toBe(403);
    const rows = await (await request('/api/admin/accounts')).json();
    const row = rows.find((value: { id: string }) => value.id === memberId);
    expect(row).toMatchObject({
      id: memberId,
      name: 'Test Person',
      email: member.email,
      role: 'member',
    });
    expect(row.disabledAt).toBeString();
    expect(Object.keys(row).sort()).toEqual(
      ['id', 'name', 'email', 'createdAt', 'disabledAt', 'role'].sort(),
    );
    expect(
      (
        await request(
          `/api/admin/accounts/${memberId}/enable`,
          admin.cookie,
          {},
        )
      ).status,
    ).toBe(200);
    expect((await request('/api/account', member.cookie)).status).toBe(401);
    const fresh = await signIn(member.email);
    expect(fresh.status).toBe(200);
    member.cookie = cookieFrom(fresh);
    expect((await request('/api/account', member.cookie)).status).toBe(200);
  });

  it('revokes sessions without disabling or deleting an account', async () => {
    expect(
      (
        await request(
          `/api/admin/accounts/${memberId}/revoke-sessions`,
          admin.cookie,
          {},
        )
      ).status,
    ).toBe(200);
    expect((await request('/api/account', member.cookie)).status).toBe(401);
    expect((await signIn(member.email)).status).toBe(200);
    expect(
      listAccounts().find(row => row.id === memberId)?.disabledAt,
    ).toBeNull();
  });

  it('offers no web privilege or password reset controls', async () => {
    for (const action of [
      'promote',
      'demote',
      'make-admin',
      'reset-password',
    ]) {
      expect(
        (
          await request(
            `/api/admin/accounts/${memberId}/${action}`,
            admin.cookie,
            {},
          )
        ).status,
      ).toBe(404);
    }
  });
});

describe('atomic access changes and audits', () => {
  it('rolls back disabling if session deletion fails', async () => {
    const person = await signUpThroughInvite('atomic-disable@scran.test');
    const id = idFor(person.email);
    db.run(`CREATE TRIGGER testFailSessionDelete BEFORE DELETE ON session
      BEGIN SELECT RAISE(ABORT, 'Test session failure'); END`);
    try {
      expect(disableAccountById(id, adminId)).rejects.toThrow(
        'Test session failure',
      );
    } finally {
      db.run('DROP TRIGGER testFailSessionDelete');
    }
    expect(listAccounts().find(row => row.id === id)?.disabledAt).toBeNull();
    expect((await request('/api/account', person.cookie)).status).toBe(200);
    expect(
      db
        .query(
          'SELECT 1 FROM managementAudit WHERE targetId = ? AND action = ?',
        )
        .get(id, 'account.disable'),
    ).toBeNull();
  });

  it('re-enabling purges surviving sessions from an interrupted older disable', async () => {
    const person = await signUpThroughInvite('atomic-enable@scran.test');
    const id = idFor(person.email);
    db.run('INSERT INTO disabledAccount (userId, disabledAt) VALUES (?, ?)', [
      id,
      new Date().toISOString(),
    ]);
    enableAccountById(id, adminId);
    expect((await request('/api/account', person.cookie)).status).toBe(401);
    expect(listAccounts().find(row => row.id === id)?.disabledAt).toBeNull();
  });

  it('rolls back session revocation and password reset when audit persistence fails', async () => {
    const person = await signUpThroughInvite('atomic-audit@scran.test');
    const id = idFor(person.email);
    const passwordRow = () =>
      db
        .query<{ password: string }, [string]>(
          "SELECT password FROM account WHERE userId = ? AND providerId = 'credential'",
        )
        .get(id);
    const before = passwordRow();
    db.run(`CREATE TRIGGER testFailAudit BEFORE INSERT ON managementAudit
      BEGIN SELECT RAISE(ABORT, 'Test audit failure'); END`);
    try {
      expect(revokeAccountSessions(id, adminId)).rejects.toThrow(
        'Test audit failure',
      );
      expect((await request('/api/account', person.cookie)).status).toBe(200);
      expect(resetPassword(person.email)).rejects.toThrow('Test audit failure');
      expect((await request('/api/account', person.cookie)).status).toBe(200);
      expect(passwordRow()).toEqual(before);
    } finally {
      db.run('DROP TRIGGER testFailAudit');
    }
  });
});

describe('admin invites and durable nonsecret audits', () => {
  it('returns a raw link only at creation, lists pending invites and revokes them', async () => {
    const created = await request('/api/admin/invites', admin.cookie, {
      email: 'management-invite@scran.test',
    });
    expect(created.status).toBe(200);
    const { url } = await created.json();
    const token = new URL(url).pathname.split('/').pop();
    const pending = await (await request('/api/admin/invites')).json();
    const invite = pending.find(
      (row: { email: string }) => row.email === 'management-invite@scran.test',
    );
    expect(Object.keys(invite).sort()).toEqual(
      ['id', 'email', 'createdAt', 'expiresAt'].sort(),
    );
    expect(JSON.stringify(pending)).not.toContain(token);
    expect((await app.request(`/api/invites/${token}`)).status).toBe(200);
    expect(
      (
        await request(
          `/api/admin/invites/${invite.id}/revoke`,
          admin.cookie,
          {},
        )
      ).status,
    ).toBe(200);
    expect((await app.request(`/api/invites/${token}`)).status).toBe(404);
    expect(
      (
        await request(
          `/api/admin/invites/${invite.id}/revoke`,
          admin.cookie,
          {},
        )
      ).status,
    ).toBe(404);
    expect(
      JSON.stringify(await (await request('/api/admin/invites')).json()),
    ).not.toContain('management-invite@scran.test');
    expect(
      JSON.stringify(db.query('SELECT * FROM managementAudit').all()),
    ).not.toContain(token);
  });

  it('signup ignores forged role, redeemed/expired invites are not pending', async () => {
    const email = 'management-forged@scran.test';
    const url = createInvite(email);
    const response = await app.request(`/api/invites/${url.split('/').pop()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Forged',
        email,
        password: 'hunter22222222',
        role: 'admin',
      }),
    });
    expect(response.status).toBe(201);
    expect(accountRole(idFor(email))).toBe('member');
    expect(
      await (await request('/api/account', cookieFrom(response))).json(),
    ).toEqual({ role: 'member' });
    expect(
      (await request('/api/admin/accounts', cookieFrom(response))).status,
    ).toBe(403);
    createInvite('management-expired@scran.test');
    const expired = listInvites().find(
      row => row.email === 'management-expired@scran.test',
    );
    if (!expired) {
      throw new Error('Missing invite');
    }
    db.run(
      "UPDATE invite SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE id = ?",
      [expired.id],
    );
    expect(
      (
        await request(
          `/api/admin/invites/${expired.id}/revoke`,
          admin.cookie,
          {},
        )
      ).status,
    ).toBe(404);
    const pending = await (await request('/api/admin/invites')).json();
    expect(
      pending.some((row: { email: string }) =>
        [email, 'management-expired@scran.test'].includes(row.email),
      ),
    ).toBeFalse();
  });

  it('records operator/admin actions, actor, target and timestamps without credentials', async () => {
    const password = await resetPassword(member.email);
    const rows = db
      .query<
        {
          actorUserId: string | null;
          action: string;
          targetId: string;
          createdAt: string;
        },
        []
      >('SELECT actorUserId, action, targetId, createdAt FROM managementAudit')
      .all();
    for (const action of [
      'account.disable',
      'account.enable',
      'account.revoke-sessions',
    ]) {
      expect(
        rows.some(
          row =>
            row.actorUserId === adminId &&
            row.action === action &&
            row.targetId === memberId,
        ),
      ).toBeTrue();
    }
    for (const action of ['account.make-admin', 'account.reset-password']) {
      expect(
        rows.some(row => row.actorUserId === null && row.action === action),
      ).toBeTrue();
    }
    expect(
      rows.some(
        row => row.actorUserId === adminId && row.action === 'invite.create',
      ),
    ).toBeTrue();
    expect(
      rows.some(
        row => row.actorUserId === adminId && row.action === 'invite.revoke',
      ),
    ).toBeTrue();
    expect(
      rows.every(
        row =>
          Number.isFinite(Date.parse(row.createdAt)) && row.targetId.length > 0,
      ),
    ).toBeTrue();
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain('hunter22222222');
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: admin.cookie }),
    });
    if (!session) {
      throw new Error('Missing admin session');
    }
    expect(serialized).not.toContain(session.session.token);
  });
});
