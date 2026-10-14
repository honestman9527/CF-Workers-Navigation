import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchBookmarkMetadata } from '../../src/worker/metadata';

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
    vi.restoreAllMocks();
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

  it.each([new Error('Connection reset'), new DOMException('Timed out', 'TimeoutError')])(
    'falls back when the response body fails after its headers arrive: %s',
    async (error) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(error);
        },
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(body, {
              headers: { 'Content-Type': 'text/html' },
            }),
        ),
      );
      const result = await fetchBookmarkMetadata('https://broken.example.com/page', faviconOpts);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.metadata).toMatchObject({
        partial: true,
        title: 'broken.example.com',
        iconUrl: 'https://icons.example.com/broken.example.com.ico',
      });
    },
  );

  it('resolves relative links against the final URL after redirects', async () => {
    const response = new Response(
      '<html><head><title>Moved</title><link rel="icon" href="icon.png"><link rel="canonical" href="./canonical"></head></html>',
      {
        headers: { 'Content-Type': 'text/html' },
      },
    );
    Object.defineProperty(response, 'url', {
      value: 'https://destination.example.com/folder/page',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );
    const result = await fetchBookmarkMetadata('https://original.example.com/', faviconOpts);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.metadata.url).toBe('https://original.example.com/');
    expect(result.metadata.iconUrl).toBe('https://destination.example.com/folder/icon.png');
    expect(result.metadata.metadata.canonical_url).toBe(
      'https://destination.example.com/folder/canonical',
    );
  });

  it('cancels an oversized streaming body after the bounded parse prefix', async () => {
    const cancel = vi.fn();
    const html = '<html><head><title>Bounded title</title></head><body>' + 'x'.repeat(600 * 1024);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html));
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(body, {
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    const result = await fetchBookmarkMetadata('https://bounded.example.com/', faviconOpts);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.metadata.title).toBe('Bounded title');
    expect(cancel).toHaveBeenCalledOnce();
  });
});
