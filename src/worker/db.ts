import type { Bindings } from './types';

import { drizzle } from 'drizzle-orm/d1';

export function getDb(env: Bindings) {
  return drizzle(env.DB);
}
