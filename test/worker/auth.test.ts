import type { AppEnv } from '../../src/worker/types';

import { exports } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { authContext, requireAuth, timingSafeEqual } from '../../src/worker/auth';
import authRoutes from '../../src/worker/routes/auth';

const env = {
  ADMIN_PASSWORD: 'dev-password',
  SESSION_SECRET: 'dev-session-secret',
  DB: undefined as unknown as D1Database,
  AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
  TEST_MIGRATIONS: [],
} satisfies AppEnv['Bindings'];

describe('timingSafeEqual', () => {
  it('accepts equal strings', async () => {
    expect(await timingSafeEqual('dev-password', 'dev-password')).toBe(true);
  });

  it('rejects unequal strings', async () => {
    expect(await timingSafeEqual('dev-password', 'wrong-password')).toBe(false);
  });
});

describe('auth middleware', () => {
  it('rejects anonymous access', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', authContext);
    app.get('/read', requireAuth, (c) => c.json({ ok: true }));

    const response = await app.request('/read', {}, env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'unauthorized', message: 'Authentication required' },
    });
  });

  it('accepts a valid bearer token', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', authContext);
    app.get('/read', requireAuth, (c) => c.json({ authed: c.get('authed') }));

    const response = await app.request(
      '/read',
      { headers: { Authorization: 'Bearer dev-password' } },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authed: true });
  });

  it('rejects an invalid bearer token', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', authContext);
    app.get('/read', requireAuth, (c) => c.json({ ok: true }));

    const response = await app.request(
      '/read',
      { headers: { Authorization: 'Bearer wrong-password' } },
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'unauthorized', message: 'Invalid bearer token' },
    });
  });
});

describe('auth api', () => {
  it('returns a retryable 429 without setting a session when the login budget is exhausted', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const app = new Hono<AppEnv>();
    app.route('/auth', authRoutes);
    const response = await app.request(
      'https://example.com/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10' },
        body: JSON.stringify({ password: 'dev-password' }),
      },
      { ...env, AUTH_RATE_LIMITER: { limit } },
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: 'rate_limited' } });
    expect(limit).toHaveBeenCalledWith({ key: 'auth:example.com:192.0.2.10' });
  });

  it('also limits invalid Bearer guesses while allowing valid administrator requests', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const app = new Hono<AppEnv>();
    app.use('*', authContext);
    app.get('/read', requireAuth, (c) => c.json({ ok: true }));
    const bindings = { ...env, AUTH_RATE_LIMITER: { limit } };
    const wrong = await app.request(
      '/read',
      { headers: { Authorization: 'Bearer wrong' } },
      bindings,
    );
    expect(wrong.status).toBe(429);
    const valid = await app.request(
      '/read',
      { headers: { Authorization: 'Bearer dev-password' } },
      bindings,
    );
    expect(valid.status).toBe(200);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it('supports the versioned v1 path', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'dev-password' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('nav_session=');
  });

  it('logs in with the password and exposes /me', async () => {
    const login = await exports.default.fetch('https://example.com/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'dev-password' }),
    });

    expect(login.status).toBe(200);
    const cookie = login.headers.get('Set-Cookie');
    expect(cookie).toContain('nav_session=');
    expect(cookie).toContain('HttpOnly');

    const me = await exports.default.fetch('https://example.com/api/v1/auth/me', {
      headers: { Cookie: cookie?.split(';')[0] ?? '' },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ ok: true });
  });

  it('rejects a wrong password', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'nope' }),
    });

    expect(response.status).toBe(401);
  });

  it('allows anonymous public lists', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/bookmarks');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
  });

  it('does not expose the legacy unversioned api alias', async () => {
    const response = await exports.default.fetch('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'dev-password' }),
    });

    expect(response.status).toBe(404);
  });
});
