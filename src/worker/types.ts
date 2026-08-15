export type Bindings = Env & {
  SESSION_SECRET?: string;
};

export type Variables = {
  authed: boolean;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
