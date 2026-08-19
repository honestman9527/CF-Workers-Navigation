import type { DrizzleD1Database } from 'drizzle-orm/d1';

export type Bindings = Env & {
  SESSION_SECRET?: string;
};

export type Db = DrizzleD1Database;

export type Variables = {
  authed: boolean;
  db: Db;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
