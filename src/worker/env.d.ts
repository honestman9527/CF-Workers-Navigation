/** Project-specific Worker bindings. Runtime types come from @cloudflare/workers-types. */
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    ADMIN_PASSWORD: string;
  }
}

interface Env extends Cloudflare.Env {}
