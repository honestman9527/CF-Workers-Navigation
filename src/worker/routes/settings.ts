import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import { getDb } from '../db';
import { jsonError } from '../errors';
import { getSettings, updateSettings, type SettingsConfig } from '../settings';

const settingsUpdateSchema = z
  .object({
    faviconProxyUrl: z
      .string()
      .trim()
      .url()
      .refine((v) => v.includes('{domain}'), 'URL must contain {domain} placeholder')
      .optional(),
    faviconProxyEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get('/', async (c) => {
  const db = getDb(c.env);
  const config = await getSettings(db);
  return c.json(config);
});

settingsRoutes.put('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 400, 'validation_error', 'Invalid JSON');
  }

  const input = settingsUpdateSchema.parse(body);
  const db = getDb(c.env);
  const updated = await updateSettings(db, input as Partial<SettingsConfig>);

  return c.json(updated);
});

export default settingsRoutes;
