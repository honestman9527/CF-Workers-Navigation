import type { AppEnv } from '../types';

import { Hono } from 'hono';

import { getAdminStats } from '../services/admin';

const adminRoutes = new Hono<AppEnv>();

adminRoutes.get('/stats', async (c) => c.json(await getAdminStats(c.get('db'))));

export default adminRoutes;
