import type { Context } from 'hono';

import type { AppEnv } from './types';

import { z } from 'zod';

import { jsonError } from './errors';
import { ServiceError } from './services/errors';

export async function parseJson(c: Context<AppEnv>) {
  try {
    return { ok: true as const, body: (await c.req.json()) as unknown };
  } catch {
    return { ok: false as const, response: jsonError(c, 400, 'validation_error', 'Invalid JSON') };
  }
}

export function handleServiceError(c: Context<AppEnv>, error: unknown): Response {
  if (error instanceof ServiceError) return jsonError(c, error.status, error.code, error.message);
  throw error;
}

export const idParamSchema = z.coerce.number().int().positive();

export const cursorSchema = z.string().trim().min(1).max(256).optional();
export const limitSchema = z.coerce.number().int().min(1).max(100).default(24);

export function parseBooleanQuery(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  throw new ServiceError(400, 'validation_error', 'Expected boolean query value');
}
