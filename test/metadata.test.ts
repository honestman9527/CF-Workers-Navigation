import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchBookmarkMetadata } from '../src/worker/metadata';

const faviconOpts = {
  faviconProxyUrl: 'https://icons.example.com/{domain}.ico',
  faviconProxyEnabled: true,
};

function stubHtmlFetch(html: string, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            ...headers,
          },
        }),
    ),
  );
}

describe('bookmark metadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not include JSON-LD, scripts, or body text in the title', async () => {
    stubHtmlFetch(`
      <!doctype html>
      <html lang="en">
        <head>
          <title>Clean FamilyPro Title</title>
          <meta name="description" content="FamilyPro helps you save on ChatGPT, Netflix, Spotify &amp; more.">
          <meta name="keywords" content="Spotify family plan, Shared Netflix premium subscription, Spotify family plan">
          <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Polluted"}</script>
          <script>MXA.init({ id: "bad" })</script>
        </head>
        <body>Body text should not become the title.</body>
      </html>
    `);

    const result = await fetchBookmarkMetadata('https://familypro.io/', faviconOpts);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.metadata.title).toBe('Clean FamilyPro Title');
    expect(result.metadata.title).not.toContain('@context');
    expect(result.metadata.title).not.toContain('MXA.init');
    expect(result.metadata.description).toBe(
      'FamilyPro helps you save on ChatGPT, Netflix, Spotify & more.',
    );
    expect(result.metadata.keywords).toEqual([
      'Spotify family plan',
      'Shared Netflix premium subscription',
    ]);
    expect(result.metadata.language).toBe('en');
    expect(result.metadata.iconUrl).toBe('https://icons.example.com/familypro.io.ico');
  });

  it('prefers clean social metadata and resolves favicon URLs', async () => {
    stubHtmlFetch(`
      <!doctype html>
      <html lang="zh-CN">
        <head>
          <title>LD士多-LinuxDo站点积分兑换中心LD士多-LinuxDo站点积分兑换中心MXA.init({ id: "bad" })</title>
          <meta property="og:title" content="LD士多-LinuxDo站点积分兑换中心LD士多-LinuxDo站点积分兑换中心">
          <meta property="og:description" content="在 LD士多 使用 Linux.do 社区积分兑换精选虚拟物品与服务。">
          <link rel="icon" href="/favicon.svg">
          <link rel="canonical" href="/store">
        </head>
      </html>
    `);

    const result = await fetchBookmarkMetadata('https://ldcstore.com/', faviconOpts);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.metadata.title).toBe('LD士多-LinuxDo站点积分兑换中心');
    expect(result.metadata.title).not.toContain('MXA.init');
    expect(result.metadata.description).toBe(
      '在 LD士多 使用 Linux.do 社区积分兑换精选虚拟物品与服务。',
    );
    expect(result.metadata.iconUrl).toBe('https://ldcstore.com/favicon.svg');
    expect(result.metadata.metadata.canonical_url).toBe('https://ldcstore.com/store');
    expect(result.metadata.language).toBe('zh-cn');
  });

  it('falls back instead of parsing oversized responses', async () => {
    stubHtmlFetch('<html><head><title>Too Large</title></head></html>', {
      'Content-Length': String(5 * 1024 * 1024 + 1),
    });

    const result = await fetchBookmarkMetadata('https://large.example.com/page', faviconOpts);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.metadata.partial).toBe(true);
    expect(result.metadata.title).toBe('large.example.com');
    expect(result.metadata.iconUrl).toBe('https://icons.example.com/large.example.com.ico');
  });
});
