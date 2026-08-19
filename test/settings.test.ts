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
    };
    expect(json.faviconProxyUrl).toContain('{domain}');
    expect(json.faviconProxyEnabled).toBe(true);
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
