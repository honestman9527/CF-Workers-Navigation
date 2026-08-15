import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import {
  clearSessionCookie,
  createSessionToken,
  isSecureRequest,
  sessionCookie,
  timingSafeEqual,
} from '../auth';
import { jsonError } from '../errors';
import { parseJson } from '../http';

const loginSchema = z.object({
  password: z.string().min(1),
});

const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) {
    return body.response;
  }

  const input = loginSchema.parse(body.body);
  if (!(await timingSafeEqual(input.password, c.env.ADMIN_PASSWORD))) {
    return jsonError(c, 401, 'unauthorized', 'Invalid password');
  }

  const token = await createSessionToken(c.env);
  c.header('Set-Cookie', sessionCookie(token, isSecureRequest(c.req.url)));
  return c.json({ ok: true });
});

authRoutes.post('/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie(isSecureRequest(c.req.url)));
  return c.json({ ok: true });
});

authRoutes.get('/me', (c) => {
  if (!c.get('authed')) {
    return jsonError(c, 401, 'unauthorized', 'Authentication required');
  }

  return c.json({ ok: true });
});

export default authRoutes;
