import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import { getDb } from '../db';
import { parseJson } from '../http';
import { getSettings, updateSettings } from '../settings';

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
  const body = await parseJson(c);
  if (!body.ok) {
    return body.response;
  }

  const input = settingsUpdateSchema.parse(body.body);
  const db = getDb(c.env);
  const updated = await updateSettings(db, input);

  return c.json(updated);
});

export default settingsRoutes;
