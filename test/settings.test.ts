import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const adminHeaders = { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' };

describe('settings api', () => {
  it('returns default settings', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/settings', {
      headers: adminHeaders,
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      faviconProxyUrl: string;
      faviconProxyEnabled: boolean;
      searchEngines: { id: string; builtin: boolean }[];
      defaultEngineId: string;
    };
    expect(json.faviconProxyUrl).toContain('{domain}');
    expect(json.faviconProxyEnabled).toBe(true);
    expect(json.searchEngines.length).toBe(5);
    expect(json.searchEngines.every((engine) => engine.builtin)).toBe(true);
    expect(json.defaultEngineId).toBe('google');
  });

  it('updates favicon proxy settings as admin', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/settings', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        faviconProxyUrl: 'https://icons.duckduckgo.com/ip3/{domain}.ico',
        faviconProxyEnabled: false,
      }),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      faviconProxyUrl: string;
      faviconProxyEnabled: boolean;
    };
    expect(json.faviconProxyUrl).toBe('https://icons.duckduckgo.com/ip3/{domain}.ico');
    expect(json.faviconProxyEnabled).toBe(false);
  });

  it('persists updated settings across requests', async () => {
    await exports.default.fetch('https://example.com/api/v1/settings', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ faviconProxyEnabled: false }),
    });

    const response = await exports.default.fetch('https://example.com/api/v1/settings', {
      headers: adminHeaders,
    });
    const json = (await response.json()) as { faviconProxyEnabled: boolean };
    expect(json.faviconProxyEnabled).toBe(false);
  });

  it('persists search engines and default engine', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/settings', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        searchEngines: [
          {
            id: 'google',
            name: 'Google',
            url: 'https://www.google.com/search?q={query}',
            builtin: true,
          },
          {
            id: 'zhihu',
            name: '知乎',
            url: 'https://www.zhihu.com/search?type=content&q={query}',
            builtin: false,
          },
        ],
        defaultEngineId: 'zhihu',
      }),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      searchEngines: { id: string; builtin: boolean }[];
      defaultEngineId: string;
    };
    expect(json.defaultEngineId).toBe('zhihu');

    const idSet = new Set(json.searchEngines.map((engine) => engine.id));
    expect(idSet.has('zhihu')).toBe(true);
    // 内置引擎不可删除：提交 google+zhihu 后，其余 4 个内置项被补回（5 内置 + 1 自定义）
    expect(json.searchEngines.length).toBe(6);
  });

  it('rejects invalid default engine id', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/settings', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        searchEngines: [
          {
            id: 'google',
            name: 'Google',
            url: 'https://www.google.com/search?q={query}',
            builtin: true,
          },
        ],
        defaultEngineId: 'missing',
      }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects search engine url without {query} placeholder', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/settings', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        searchEngines: [
          { id: 'google', name: 'Google', url: 'https://www.google.com/', builtin: true },
        ],
        defaultEngineId: 'google',
      }),
    });

    expect(response.status).toBe(400);
  });

  it('uses the configured tool for standalone favicon requests', async () => {
    await exports.default.fetch('https://example.com/api/v1/settings', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        faviconProxyUrl: 'https://icons.duckduckgo.com/ip3/{domain}.ico',
        faviconProxyEnabled: true,
      }),
    });

    const response = await exports.default.fetch(
      'https://example.com/api/v1/bookmarks/favicon?url=https%3A%2F%2Fdevelopers.cloudflare.com%2Fworkers',
      { headers: adminHeaders },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: 'https://developers.cloudflare.com/workers',
      iconUrl: 'https://icons.duckduckgo.com/ip3/developers.cloudflare.com.ico',
      source: 'proxy',
    });
  });

  it('requires admin token for updates', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faviconProxyEnabled: true }),
    });

    expect(response.status).toBe(401);
  });

  it('rejects invalid favicon proxy URL without {domain} placeholder', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/settings', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ faviconProxyUrl: 'https://example.com/favicon.ico' }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects empty update body', async () => {
    const response = await exports.default.fetch('https://example.com/api/v1/settings', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });
});
