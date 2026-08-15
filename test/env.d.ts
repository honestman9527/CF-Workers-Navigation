declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ADMIN_PASSWORD: string;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
