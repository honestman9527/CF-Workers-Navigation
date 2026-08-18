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
    expect(url).toBe('https://nav.example.com/api/v1/bookmarks/search?q=cloud+flare');
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

  it('builds a standalone favicon request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: 'https://example.com/path',
          iconUrl: 'https://icons.example.com/example.com.ico',
          source: 'proxy',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = createApiClient({ baseUrl: 'https://nav.example.com', fetch });

    await client.getFavicon(undefined, 'https://example.com/path');

    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://nav.example.com/api/v1/bookmarks/favicon?url=https%3A%2F%2Fexample.com%2Fpath',
    );
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
