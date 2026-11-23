import type { Context } from 'hono';

import type { AppEnv } from './types';

import { createMiddleware } from 'hono/factory';

import { jsonError } from './errors';

const SESSION_COOKIE = 'nav_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_PAYLOAD_PATTERN = /^v1\.(\d+)$/;

export function getAdminPassword(env: AppEnv['Bindings']): string | undefined {
  return typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length > 0
    ? env.ADMIN_PASSWORD
    : undefined;
}

export async function timingSafeEqual(left: string, right: string) {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let diff = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }

  return diff === 0;
}

function bearerToken(header: string | undefined) {
  if (!header) return undefined;
  const match = header.match(/^Bearer(?:\s+(.*))?$/i);
  return match ? (match[1] ?? '') : undefined;
}

function sessionSecret(env: AppEnv['Bindings']): string | undefined {
  if (typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length > 0) {
    return env.SESSION_SECRET;
  }
  return getAdminPassword(env);
}

function cookieValue(header: string | undefined, name: string) {
  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === name) {
      return rest.join('=');
    }
  }

  return undefined;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hmacSign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function createSessionToken(env: AppEnv['Bindings']) {
  const secret = sessionSecret(env);
  if (!secret) throw new Error('Missing session secret configuration');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${expiresAt}`;
  const signature = await hmacSign(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(env: AppEnv['Bindings'], token: string) {
  const secret = sessionSecret(env);
  if (!secret) return false;

  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) {
    return false;
  }

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const payloadMatch = payload.match(SESSION_PAYLOAD_PATTERN);
  if (!payloadMatch || !signature) {
    return false;
  }

  const expected = await hmacSign(secret, payload);
  if (signature.length !== expected.length || !(await timingSafeEqual(signature, expected))) {
    return false;
  }

  const expiresAt = Number(payloadMatch[1]);
  return Number.isSafeInteger(expiresAt) && expiresAt > Math.floor(Date.now() / 1000);
}

export function sessionCookie(token: string, secure: boolean) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function isSecureRequest(url: string) {
  return new URL(url).protocol === 'https:';
}

/** Login and invalid Bearer attempts share the same per-site, per-client budget. */
export async function limitAuthAttempts(c: Context<AppEnv>): Promise<Response | undefined> {
  const host = new URL(c.req.url).hostname;
  const client = c.req.header('CF-Connecting-IP') ?? 'local';
  const { success } = await c.env.AUTH_RATE_LIMITER.limit({ key: `auth:${host}:${client}` });
  if (!success) {
    c.header('Retry-After', '60');
    return jsonError(c, 429, 'rate_limited', '尝试过于频繁，请一分钟后重试');
  }
}

export const authContext = createMiddleware<AppEnv>(async (c, next) => {
  c.set('authed', false);

  const token = bearerToken(c.req.header('Authorization'));
  if (token !== undefined) {
    const adminPassword = getAdminPassword(c.env);
    if (!adminPassword) {
      console.error({ event: 'auth-misconfigured', requestId: c.get('requestId') });
      return jsonError(c, 500, 'internal_error', 'Authentication is not configured');
    }
    if (!(await timingSafeEqual(token, adminPassword))) {
      const limited = await limitAuthAttempts(c);
      if (limited) return limited;
      return jsonError(c, 401, 'unauthorized', 'Invalid bearer token');
    }
    c.set('authed', true);
    c.header('X-Nav-Authenticated', 'true');
    await next();
    return;
  }

  const cookieToken = cookieValue(c.req.header('Cookie'), SESSION_COOKIE);
  if (cookieToken && (await verifySessionToken(c.env, cookieToken))) {
    c.set('authed', true);
  }

  c.header('X-Nav-Authenticated', String(c.get('authed')));
  await next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('authed')) {
    return jsonError(c, 401, 'unauthorized', 'Authentication required');
  }

  await next();
});
