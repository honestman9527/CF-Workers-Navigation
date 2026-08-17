import type { Context } from 'hono';

import type { AppEnv } from './types';

import { z } from 'zod';

import { jsonError } from './errors';
import { ServiceError } from './services/errors';

export async function parseJson(c: Context<AppEnv>) {
  try {
    const body: unknown = await c.req.json();
    return { ok: true as const, body };
  } catch {
    return { ok: false as const, response: jsonError(c, 400, 'validation_error', 'Invalid JSON') };
  }
}

export function handleServiceError(c: Context<AppEnv>, error: unknown): Response {
  if (error instanceof ServiceError) {
    return jsonError(c, error.status, error.code, error.message);
  }
  throw error;
}

export function includeChildrenRequested(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export const idParamSchema = z.coerce.number().int().positive();

export function reorderItemsSchema(label: string) {
  return z.object({
    items: z
      .array(z.object({ id: z.number().int().positive(), sortOrder: z.number().int() }))
      .min(1)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
        message: `${label} ids must be unique`,
      }),
  });
}
