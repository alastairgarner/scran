import { describe, expect, it } from 'bun:test';

import { Hono } from 'hono';

import { createInvite } from '../auth';
import { config } from '../config';
import { app } from '../index';
import { signUpThroughInvite } from '../testing';
import {
  createRequestLimiter,
  identifyRequest,
  publicRequestLimits,
  requestBodyLimits,
  requestClientIp,
  safeRequestPath,
} from './security';

const bodyApp = new Hono();
bodyApp.use('*', requestBodyLimits());
bodyApp.post('*', async c =>
  c.json({ bytes: (await c.req.arrayBuffer()).byteLength }),
);

describe('public request boundaries', () => {
  it('redacts invite tokens, including malformed and encoded paths', () => {
    for (const path of [
      '/invite/secret',
      '/api/invites/secret',
      '/INVITE%2fsecret',
      '/invite/a/b',
    ]) {
      expect(safeRequestPath(path)).not.toContain('secret');
      expect(safeRequestPath(path)).toContain('[redacted]');
    }
    expect(safeRequestPath('/api/recipes/123')).toBe('/api/recipes/123');
  });

  it('sets privacy and browser headers even on an error response', async () => {
    const response = await app.request('/api/invites/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'",
    );
  });

  it('rejects oversized auth and invite bodies before parsing JSON', async () => {
    const token = createInvite().split('/').pop();
    for (const path of ['/api/auth/sign-in/email', `/api/invites/${token}`]) {
      const response = await app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(20_000) }),
      });
      expect(response.status).toBe(413);
    }
  });

  it('counts bytes even if Content-Length understates them', async () => {
    const response = await bodyApp.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-length': '1' },
      body: 'x'.repeat(20_000),
    });
    expect(response.status).toBe(413);
  });

  it('rejects anonymous uploads before multipart parsing', async () => {
    const response = await app.request('/api/recipes', {
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=broken',
        origin: config.baseUrl,
      },
      body: 'invalid multipart',
    });
    expect(response.status).toBe(401);
  });

  it('leaves small valid bodies readable by downstream parsers', async () => {
    const response = await bodyApp.request('/api/auth/sign-in/email', {
      method: 'POST',
      body: 'small',
    });
    expect(await response.json()).toEqual({ bytes: 5 });
  });

  it('cannot rotate an untrusted IP header to bypass login throttling', async () => {
    const { email } = await signUpThroughInvite('proxy-header@scran.test');
    const results: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      const untrusted =
        config.authIpHeader === 'x-real-ip' ? 'x-forwarded-for' : 'x-real-ip';
      const response = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: config.baseUrl,
          [config.authIpHeader]: '198.51.100.240',
          [untrusted]: `203.0.113.${attempt + 1}`,
        },
        body: JSON.stringify({ email, password: 'incorrect-password' }),
      });
      results.push(response.status);
    }
    expect(results).toEqual([401, 401, 401, 429]);
  });

  it('groups IPv6 clients by /64 just like Better Auth', () => {
    const first = new Request('http://localhost', {
      headers: { [config.authIpHeader]: '2001:db8:1234:5678::1' },
    });
    const second = new Request('http://localhost', {
      headers: { [config.authIpHeader]: '2001:db8:1234:5678:ffff::ffff' },
    });
    expect(requestClientIp(first)).toBe(requestClientIp(second));
  });

  it('keeps get-session available when an IP exhausts public request limits', async () => {
    const limited = new Hono();
    limited.use('*', publicRequestLimits);
    limited.all('*', c => c.json({ ok: true }));
    const headers = { [config.authIpHeader]: '198.51.100.221' };
    for (let request = 0; request < 100; request++) {
      expect(
        (await limited.request('/api/invites/not-a-token', { headers })).status,
      ).toBe(200);
    }
    expect(
      (await limited.request('/api/invites/not-a-token', { headers })).status,
    ).toBe(429);
    expect(
      (await limited.request('/api/auth/get-session', { headers })).status,
    ).toBe(200);
  });

  it('isolates slow anonymous bodies from other IPs and signed-in writes', async () => {
    const isolated = new Hono();
    isolated.use('*', async (c, next) => {
      if (c.req.header('x-test-user')) {
        identifyRequest(c.req.raw, 'signed-in-person');
      }
      await next();
    });
    isolated.use('*', requestBodyLimits({ smallDeadlineMs: 1000 }));
    isolated.post('*', async c => c.text(await c.req.text()));
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    const headers = { [config.authIpHeader]: '198.51.100.222' };
    const held = Array.from({ length: 4 }, () =>
      isolated.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controllers.push(controller);
            controller.enqueue(new Uint8Array([1]));
          },
        }),
      }),
    );
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(
        (
          await isolated.request('/api/auth/sign-in/email', {
            method: 'POST',
            headers,
            body: 'another',
          })
        ).status,
      ).toBe(429);
      expect(
        (
          await isolated.request('/api/auth/sign-in/email', {
            method: 'POST',
            headers: { [config.authIpHeader]: '198.51.100.223' },
            body: 'other IP',
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await isolated.request('/api/recipes/1/versions', {
            method: 'POST',
            headers: { ...headers, 'x-test-user': 'yes' },
            body: 'signed-in write',
          })
        ).status,
      ).toBe(200);
    } finally {
      for (const controller of controllers) {
        controller.close();
      }
      await Promise.all(held.map(response => Promise.resolve(response)));
    }
  });

  it('allows progressing uploads, rejects stalled/disconnected bodies and frees slots', async () => {
    const uploads = new Hono();
    uploads.use(
      '*',
      requestBodyLimits({ uploadIdleMs: 30, uploadDeadlineMs: 500 }),
    );
    uploads.post('*', async c => c.text(await c.req.text()));
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (let chunk = 0; chunk < 8; chunk++) {
          controller.enqueue(new Uint8Array([65]));
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        controller.close();
      },
    });
    expect(
      (await uploads.request('/api/recipes', { method: 'POST', body })).status,
    ).toBe(200);
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([65]));
      },
    });
    expect(
      (await uploads.request('/api/recipes', { method: 'POST', body: stalled }))
        .status,
    ).toBe(408);
    const disconnected = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('Disconnected'));
      },
    });
    expect(
      (
        await uploads.request('/api/recipes', {
          method: 'POST',
          body: disconnected,
        })
      ).status,
    ).toBe(400);
    expect(
      (await uploads.request('/api/recipes', { method: 'POST', body: 'okay' }))
        .status,
    ).toBe(200);
    expect(
      (await uploads.request('/not-an-api', { method: 'POST', body: 'no' }))
        .status,
    ).toBe(405);
  });

  it('bounds limiter memory without locking out new keys or evicting active windows', () => {
    const allow = createRequestLimiter({
      limit: 2,
      windowMs: 1000,
      maxKeys: 2,
    });
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 1)).toBe(true);
    expect(allow('a', 2)).toBe(false);
    expect(allow('b', 2)).toBe(true);
    expect(allow('c', 3)).toBe(true);
    expect(allow('a', 4)).toBe(false);
    expect(allow('c', 1001)).toBe(true);
  });
});
