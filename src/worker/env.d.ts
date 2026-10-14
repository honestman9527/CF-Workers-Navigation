/** Secrets supplement the bindings generated in bindings.d.ts. */
declare namespace Cloudflare {
  interface Env {
    ADMIN_PASSWORD: string;
  }
}

interface Env extends Cloudflare.Env {}
