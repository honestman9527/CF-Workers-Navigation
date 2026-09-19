import type { AppEnv } from './types';

import { Hono } from 'hono';
import { ZodError } from 'zod';

import { API_V1_PREFIX } from '../shared/api/endpoints';
import { authContext, requireAuth } from './auth';
import { getDb } from './db';
import { jsonError, zodErrorMessage } from './errors';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import bookmarksRoutes from './routes/bookmarks';
import categoriesRoutes from './routes/categories';
import settingsRoutes from './routes/settings';
import tagsRoutes from './routes/tags';
import transferRoutes from './routes/transfer';

const app = new Hono<AppEnv>();

const api = new Hono<AppEnv>();
api.route('/admin', adminRoutes);
api.route('/auth', authRoutes);
api.route('/bookmarks', bookmarksRoutes);
api.route('/categories', categoriesRoutes);
api.route('/settings', settingsRoutes);
api.route('/tags', tagsRoutes);
api.route('/transfer', transferRoutes);

app.use(`${API_V1_PREFIX}/*`, async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  await next();
});
app.use(`${API_V1_PREFIX}/*`, authContext);
app.use(`${API_V1_PREFIX}/*`, async (c, next) => {
  c.set('db', getDb(c.env));
  await next();
});
app.use(`${API_V1_PREFIX}/*`, async (c, next) => {
  const path = new URL(c.req.url).pathname.replace(/\/$/, '');
  const publicRead =
    c.req.method === 'GET' &&
    ([
      'bookmarks',
      'bookmarks/search',
      'bookmarks/tags',
      'categories',
      'tags',
      'settings/public',
    ].some((route) => path === `${API_V1_PREFIX}/${route}`) ||
      /^\/api\/v1\/bookmarks\/\d+$/.test(path));
  if (publicRead) {
    if (
      !c.get('authed') &&
      path.startsWith(`${API_V1_PREFIX}/bookmarks`) &&
      c.req.query('view') &&
      c.req.query('view') !== 'active'
    ) {
      return requireAuth(c, next);
    }
    await next();
    return;
  }
  if (path === `${API_V1_PREFIX}/auth/login` || path === `${API_V1_PREFIX}/auth/logout`) {
    await next();
    return;
  }
  return requireAuth(c, next);
});

app.get('/health', (c) => c.json({ ok: true }));
app.route(API_V1_PREFIX, api);

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
