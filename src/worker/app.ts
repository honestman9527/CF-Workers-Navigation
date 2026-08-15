import type { AppEnv } from './types';

import { Hono } from 'hono';
import { ZodError } from 'zod';

import { ENDPOINTS } from '../shared/api/endpoints';
import { authContext, requireAuth } from './auth';
import { jsonError, zodErrorMessage } from './errors';
import authRoutes from './routes/auth';
import bookmarksRoutes from './routes/bookmarks';
import categoriesRoutes from './routes/categories';
import settingsRoutes from './routes/settings';
import transferRoutes from './routes/transfer';

const app = new Hono<AppEnv>();

app.use('/api/*', authContext);
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === ENDPOINTS.authLogin || path === ENDPOINTS.authLogout) {
    await next();
    return;
  }
  return requireAuth(c, next);
});

app.get('/health', (c) => c.json({ ok: true }));
app.route('/api/auth', authRoutes);
app.route(ENDPOINTS.bookmarks, bookmarksRoutes);
app.route(ENDPOINTS.categories, categoriesRoutes);
app.route(ENDPOINTS.settings, settingsRoutes);
app.route('/api/transfer', transferRoutes);

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
