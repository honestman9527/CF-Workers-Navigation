import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import { parseJson } from '../http';
import { getSettings, updateSettings } from '../settings';

const engineSchema = z.object({
  id: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(40),
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => value.includes('{query}'), 'URL must contain {query} placeholder'),
  iconUrl: z.string().trim().url().optional(),
  builtin: z.boolean(),
});

const settingsUpdateSchema = z
  .object({
    faviconProxyUrl: z
      .string()
      .trim()
      .url()
      .refine((value) => value.includes('{domain}'), 'URL must contain {domain} placeholder')
      .optional(),
    faviconProxyEnabled: z.boolean().optional(),
    searchEngines: z.array(engineSchema).min(1).max(20).optional(),
    defaultEngineId: z.string().trim().min(1).max(32).optional(),
    backgroundImageUrl: z
      .string()
      .trim()
      .max(2048)
      .optional()
      .superRefine((value, ctx) => {
        if (value === undefined || value === '') return;
        try {
          const url = new URL(value);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('unsupported protocol');
          }
        } catch {
          ctx.addIssue({
            code: 'custom',
            path: ['backgroundImageUrl'],
            message: 'Background image URL must be a valid http(s) URL',
          });
        }
      }),
    backgroundImageEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })
  .superRefine((value, ctx) => {
    if (value.searchEngines !== undefined) {
      const ids = value.searchEngines.map((engine) => engine.id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['searchEngines'],
          message: 'Search engine ids must be unique',
        });
      }
      if (value.defaultEngineId !== undefined && !ids.includes(value.defaultEngineId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['defaultEngineId'],
          message: 'defaultEngineId must exist in searchEngines',
        });
      }
    }
  });

const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get('/', async (c) => {
  const config = await getSettings(c.get('db'));
  return c.json(config);
});

settingsRoutes.put('/', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) {
    return body.response;
  }

  const input = settingsUpdateSchema.parse(body.body);
  const updated = await updateSettings(c.get('db'), input);

  return c.json(updated);
});

export default settingsRoutes;
