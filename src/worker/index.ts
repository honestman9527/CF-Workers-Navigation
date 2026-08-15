import type { AppEnv } from './types';

import app from './app';

async function serveStaticAsset(request: Request, assets: Fetcher) {
  const assetResponse = await assets.fetch(request);

  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  const fallbackUrl = new URL(request.url);
  fallbackUrl.pathname = '/index.html';
  fallbackUrl.search = '';
  return assets.fetch(new Request(fallbackUrl.toString(), request));
}

export default {
  async fetch(request: Request, env: AppEnv['Bindings'], ctx: ExecutionContext) {
    const pathname = new URL(request.url).pathname;

    if (pathname === '/health' || pathname === '/api' || pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }

    return serveStaticAsset(request, env.ASSETS);
  },
};
