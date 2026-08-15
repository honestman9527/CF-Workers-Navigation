import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';

describe('nav shared api client', () => {
  it('builds a request through the injected fetch adapter', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://nav.example.com/',
      getToken: () => 'secret',
      fetch,
    });

    await client.searchBookmarks(undefined, 'cloud flare');

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://nav.example.com/api/bookmarks/search?q=cloud+flare');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret');
  });

  it('forwards an abort signal to read requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createApiClient({ fetch });
    const controller = new AbortController();

    await client.getCategories(undefined, controller.signal);

    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('normalizes error responses at the shared seam', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'forbidden', message: 'No access' } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createApiClient({ fetch });

    await expect(client.getCategories()).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: 'No access',
    });
  });
});
