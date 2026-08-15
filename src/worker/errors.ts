import type { Context } from 'hono';

import type { ErrorCode } from '../shared/errors';

import type { AppEnv } from './types';

import { ZodError } from 'zod';

export function jsonError(
  c: Context<AppEnv>,
  status: 400 | 401 | 404 | 409 | 413 | 500 | 502,
  code: ErrorCode,
  message: string,
) {
  return c.json({ error: { code, message } }, status);
}

export function zodErrorMessage(error: ZodError) {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}
