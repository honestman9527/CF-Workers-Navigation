import type { Bindings, Db } from './types';

import { drizzle } from 'drizzle-orm/d1';

export function getDb(env: Bindings): Db {
  return drizzle(env.DB);
}
