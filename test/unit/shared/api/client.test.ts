import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@shared/api/client';

describe('nav shared api client', () => {
  it('builds a request through the injected fetch adapter', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://nav.example.com/',
      getToken: () => 'secret',
      fetch,
    });

    await client.searchBookmarks('cloud flare');

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://nav.example.com/api/v1/bookmarks/search?q=cloud+flare');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret');
  });

  it('serializes untagged for both listing and search without consuming tag slugs', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
      );
    const client = createApiClient({ baseUrl: 'https://nav.example.com', fetch });
    await client.getBookmarks({ untagged: true });
    await client.searchBookmarks('demo', { untagged: true, tag: 'untagged' });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://nav.example.com/api/v1/bookmarks?untagged=true');
    const query = new URL(String(fetch.mock.calls[1]?.[0])).searchParams;
    expect(query.get('untagged')).toBe('true');
    expect(query.get('tag')).toBe('untagged');
  });

  it('forwards an abort signal to read requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createApiClient({ fetch });
    const controller = new AbortController();

    await client.getBookmarks(undefined, controller.signal);

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

    await client.getFavicon('https://example.com/path');

    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://nav.example.com/api/v1/bookmarks/favicon?url=https%3A%2F%2Fexample.com%2Fpath',
    );
  });

  it('builds a reorderBookmarks request', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: 'https://nav.example.com',
      getToken: () => 'secret',
      fetch,
    });

    await client.reorderBookmarks([3, 1, 2]);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://nav.example.com/api/v1/bookmarks/reorder');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ ids: [3, 1, 2] }));
  });

  it('builds a copyBookmark request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 9, categoryId: 3 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://nav.example.com',
      getToken: () => 'secret',
      fetch,
    });

    await client.copyBookmark(5, 3);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://nav.example.com/api/v1/bookmarks/5/copy');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ categoryId: 3 }));
  });

  it('normalizes error responses at the shared seam', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'forbidden', message: 'No access' } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createApiClient({ fetch });

    await expect(client.getBookmarks()).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: 'No access',
    });
  });
});
