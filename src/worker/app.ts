import type { AppEnv } from './types';

import { Hono } from 'hono';
import { ZodError } from 'zod';

import { API_V1_PREFIX } from '../shared/api/endpoints';
import { authContext, requireAuth } from './auth';
import { jsonError, zodErrorMessage } from './errors';
import authRoutes from './routes/auth';
import bookmarksRoutes from './routes/bookmarks';
import categoriesRoutes from './routes/categories';
import settingsRoutes from './routes/settings';
import transferRoutes from './routes/transfer';

const app = new Hono<AppEnv>();

const LEGACY_API_PREFIX = '/api';
const API_PREFIXES = [API_V1_PREFIX, LEGACY_API_PREFIX] as const;

const api = new Hono<AppEnv>();
api.route('/auth', authRoutes);
api.route('/bookmarks', bookmarksRoutes);
api.route('/categories', categoriesRoutes);
api.route('/settings', settingsRoutes);
api.route('/transfer', transferRoutes);

app.use('/api/*', authContext);
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (
    API_PREFIXES.some(
      (prefix) => path === `${prefix}/auth/login` || path === `${prefix}/auth/logout`,
    )
  ) {
    await next();
    return;
  }
  return requireAuth(c, next);
});

app.get('/health', (c) => c.json({ ok: true }));
app.route(API_V1_PREFIX, api);
app.route(LEGACY_API_PREFIX, api);

app.notFound((c) => jsonError(c, 404, 'not_found', 'Not found'));

app.onError((error, c) => {
  if (error instanceof ZodError) {
    return jsonError(c, 400, 'validation_error', zodErrorMessage(error));
  }

  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    return jsonError(c, 409, 'conflict', 'Unique constraint failed');
  }

  console.error(error);
  return jsonError(c, 500, 'internal_error', 'Internal server error');
});

export default app;
