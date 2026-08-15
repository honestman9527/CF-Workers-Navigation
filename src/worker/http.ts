import type { Context } from 'hono';

import type { AppEnv } from './types';

import { jsonError } from './errors';

export async function parseJson(c: Context<AppEnv>) {
  try {
    const body: unknown = await c.req.json();
    return { ok: true as const, body };
  } catch {
    return { ok: false as const, response: jsonError(c, 400, 'validation_error', 'Invalid JSON') };
  }
}

export function includeChildrenRequested(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}
