import type { AppEnv } from './types';

import { createMiddleware } from 'hono/factory';

import { jsonError } from './errors';

const SESSION_COOKIE = 'nav_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function timingSafeEqual(left: string, right: string) {
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
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }

  return header.slice('Bearer '.length);
}

function sessionSecret(env: AppEnv['Bindings']) {
  return env.SESSION_SECRET || env.ADMIN_PASSWORD;
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
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${expiresAt}`;
  const signature = await hmacSign(sessionSecret(env), payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(env: AppEnv['Bindings'], token: string) {
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) {
    return false;
  }

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = await hmacSign(sessionSecret(env), payload);
  if (signature.length !== expected.length || !(await timingSafeEqual(signature, expected))) {
    return false;
  }

  const [, expiresRaw] = payload.split('.');
  const expiresAt = Number(expiresRaw);
  return Number.isFinite(expiresAt) && expiresAt > Math.floor(Date.now() / 1000);
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

export const authContext = createMiddleware<AppEnv>(async (c, next) => {
  c.set('authed', false);

  const token = bearerToken(c.req.header('Authorization'));
  if (token !== undefined) {
    if (!(await timingSafeEqual(token, c.env.ADMIN_PASSWORD))) {
      return jsonError(c, 401, 'unauthorized', 'Invalid bearer token');
    }
    c.set('authed', true);
    await next();
    return;
  }

  const cookieToken = cookieValue(c.req.header('Cookie'), SESSION_COOKIE);
  if (cookieToken && (await verifySessionToken(c.env, cookieToken))) {
    c.set('authed', true);
  }

  await next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('authed')) {
    return jsonError(c, 401, 'unauthorized', 'Authentication required');
  }

  await next();
});
