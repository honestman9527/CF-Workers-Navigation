import type { AppEnv } from '../../src/worker/types';

import { env, exports } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../../src/worker/app';
import { authContext, requireAuth, timingSafeEqual } from '../../src/worker/auth';
import { decodeListCursor, encodeListCursor } from '../../src/worker/cursor';
import { fetchBookmarkMetadata } from '../../src/worker/metadata';
import authRoutes from '../../src/worker/routes/auth';
import { getAdminStats } from '../../src/worker/services/admin';
import { createBookmark, updateBookmark } from '../../src/worker/services/bookmarks';
import { createCategory, reorderCategories } from '../../src/worker/services/categories';
import { importTransferData } from '../../src/worker/services/transfer';
import { parseHtml } from '../../src/worker/transfer/html';
import { parseJson } from '../../src/worker/transfer/json';

const API = 'https://example.com/api/v1';
const adminHeaders = {
  Authorization: 'Bearer dev-password',
  'Content-Type': 'application/json',
};

function observeDb() {
  const queries: Array<{ query: string; params: unknown[] }> = [];
  const db = drizzle(env.DB, {
    logger: {
      logQuery(query, params) {
        if (params.length > 100) {
          throw new Error(`D1 parameter budget exceeded: ${params.length}`);
        }
        queries.push({ query, params });
      },
    },
  });
  return { db, queries };
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM bookmark_tags'),
    env.DB.prepare('DELETE FROM bookmarks'),
    env.DB.prepare('DELETE FROM tags'),
    env.DB.prepare('DELETE FROM categories'),
    env.DB.prepare('DELETE FROM settings'),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('auth hardening', () => {
  it('never authenticates when ADMIN_PASSWORD is empty or missing', async () => {
    expect(await timingSafeEqual('', '')).toBe(false);

    const testApp = new Hono<AppEnv>();
    testApp.use('*', authContext);
    testApp.route('/auth', authRoutes);
    testApp.get('/protected', requireAuth, (c) => c.json({ ok: true }));

    const brokenEnv = {
      ...env,
      ADMIN_PASSWORD: '',
      SESSION_SECRET: '',
    } as AppEnv['Bindings'];

    const emptyBearer = await testApp.request(
      '/protected',
      { headers: { Authorization: 'Bearer ' } },
      brokenEnv,
    );
    expect(emptyBearer.status).toBe(500);

    const nonEmptyBearer = await testApp.request(
      '/protected',
      { headers: { Authorization: 'Bearer anything' } },
      brokenEnv,
    );
    expect(nonEmptyBearer.status).toBe(500);

    const loginAttempt = await testApp.request(
      'https://example.com/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'anything' }),
      },
      brokenEnv,
    );
    expect(loginAttempt.status).toBe(500);
  });

  it('accepts case-insensitive Bearer scheme and rejects oversized login password', async () => {
    const response = await exports.default.fetch(`${API}/auth/me`, {
      headers: { Authorization: 'bearer dev-password' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-Id')).toBeTruthy();

    const oversized = await exports.default.fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'a'.repeat(300) }),
    });
    expect(oversized.status).toBe(400);
  });
});

describe('URL protocol, field length, and settings validation', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
  ])('rejects unsafe bookmark url or iconUrl protocol: %s', async (badUrl) => {
    const badBookmark = await exports.default.fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'Bad', url: badUrl }),
    });
    expect(badBookmark.status).toBe(400);

    const badIcon = await exports.default.fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Bad Icon',
        url: 'https://safe.example.com',
        iconUrl: badUrl,
      }),
    });
    expect(badIcon.status).toBe(400);
  });

  it('rejects oversized bookmark title or description', async () => {
    const longTitle = await exports.default.fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'x'.repeat(201), url: 'https://long-title.example.com' }),
    });
    expect(longTitle.status).toBe(400);

    const longDesc = await exports.default.fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Valid',
        url: 'https://long-desc.example.com',
        description: 'd'.repeat(2001),
      }),
    });
    expect(longDesc.status).toBe(400);
  });

  it('rejects standalone invalid defaultEngineId, unsafe engine urls, and preserves builtin flags', async () => {
    const invalidDefault = await exports.default.fetch(`${API}/settings`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ defaultEngineId: 'missing-engine' }),
    });
    expect(invalidDefault.status).toBe(400);

    const unsafeEngine = await exports.default.fetch(`${API}/settings`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        searchEngines: [
          { id: 'evil', name: 'Evil', url: 'javascript:alert({query})', builtin: false },
        ],
        defaultEngineId: 'evil',
      }),
    });
    expect(unsafeEngine.status).toBe(400);

    const unsafeFavicon = await exports.default.fetch(`${API}/settings`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ faviconProxyUrl: 'javascript:alert({domain})' }),
    });
    expect(unsafeFavicon.status).toBe(400);

    const tamperBuiltin = await exports.default.fetch(`${API}/settings`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        searchEngines: [
          {
            id: 'google',
            name: 'Google',
            url: 'https://www.google.com/search?q={query}',
            builtin: false,
          },
        ],
        defaultEngineId: 'google',
      }),
    });
    expect(tamperBuiltin.status).toBe(200);
    const updated = (await tamperBuiltin.json()) as {
      searchEngines: Array<{ id: string; builtin: boolean }>;
    };
    expect(updated.searchEngines.find((engine) => engine.id === 'google')?.builtin).toBe(true);
  });
});

describe('metadata SSRF, redirect, and icon protocol protection', () => {
  const faviconOpts = {
    faviconProxyUrl: 'https://icons.example.com/{domain}.ico',
    faviconProxyEnabled: true,
  };

  it.each([
    'http://127.0.0.1/secret',
    'http://localhost:8787/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.1.1/',
    'http://10.0.0.1/',
    'http://[::1]/',
  ])('blocks private metadata target without calling fetch: %s', async (target) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchBookmarkMetadata(target, faviconOpts);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.metadata.partial).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks redirect hops to private networks and strips unsafe link protocols', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://redirect-private.example.com/') {
        return new Response(null, {
          status: 302,
          headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
        });
      }
      if (url === 'https://redirect-public.example.com/') {
        return new Response(null, {
          status: 301,
          headers: { Location: 'https://final.example.com/page' },
        });
      }
      return new Response(
        '<html><head><title>Safe Page</title><link rel="icon" href="javascript:alert(1)"><link rel="canonical" href="javascript:void(0)"></head></html>',
        { headers: { 'Content-Type': 'text/html' } },
      );
    });
    vi.stubGlobal('fetch', fetchSpy);

    const blocked = await fetchBookmarkMetadata(
      'https://redirect-private.example.com/',
      faviconOpts,
    );
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) throw new Error(blocked.error);
    expect(blocked.metadata.partial).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const safe = await fetchBookmarkMetadata('https://redirect-public.example.com/', faviconOpts);
    expect(safe.ok).toBe(true);
    if (!safe.ok) throw new Error(safe.error);
    expect(safe.metadata.partial).toBeUndefined();
    expect(safe.metadata.title).toBe('Safe Page');
    expect(safe.metadata.iconUrl).toBe('https://icons.example.com/redirect-public.example.com.ico');
    expect(safe.metadata.metadata.canonical_url).toBe('');
  });
});

describe('correctness, FTS, cursor UTF-8, error mapping, and concurrency', () => {
  it('handles punctuation-only FTS queries cleanly and returns total: 0 in offset mode', async () => {
    const cursorSearch = await exports.default.fetch(
      `${API}/bookmarks/search?q=${encodeURIComponent('--- !!! ()')}`,
      { headers: adminHeaders },
    );
    expect(cursorSearch.status).toBe(200);
    expect(await cursorSearch.json()).toEqual({ items: [], nextCursor: null });

    const offsetSearch = await exports.default.fetch(
      `${API}/bookmarks/search?q=${encodeURIComponent('---')}&offset=0`,
      { headers: adminHeaders },
    );
    expect(offsetSearch.status).toBe(200);
    expect(await offsetSearch.json()).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it('rejects excessive offset values', async () => {
    const response = await exports.default.fetch(`${API}/bookmarks?offset=100001`, {
      headers: adminHeaders,
    });
    expect(response.status).toBe(400);
  });

  it('encodes and decodes UTF-8 cursors without throwing on non-ASCII timestamps', () => {
    const encoded = encodeListCursor({ createdAt: '2026年01月01日', id: 42 });
    expect(decodeListCursor(encoded)).toEqual({ createdAt: '2026年01月01日', id: 42 });
  });

  it('maps nested Drizzle UNIQUE constraint errors to 409 conflict', async () => {
    const db = drizzle(env.DB);
    const created = await createBookmark(db, {
      title: 'Unique Target',
      url: 'https://unique-chain.example.com',
    });
    // 绕过应用层查重直接触发数据库唯一约束（模拟并发窗口），验证全局错误链映射为 409。
    await env.DB.prepare(
      `CREATE TRIGGER fail_unique BEFORE UPDATE ON bookmarks
       BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: bookmarks.url_normalized'); END`,
    ).run();
    try {
      const response = await app.fetch(
        new Request(`${API}/bookmarks/${created.id}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({ title: 'Trigger Unique' }),
        }),
        env,
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: 'conflict' } });
    } finally {
      await env.DB.prepare('DROP TRIGGER IF EXISTS fail_unique').run();
    }
  });

  it('guards updateBookmark against concurrent archive or deletion', async () => {
    const db = drizzle(env.DB);
    const bookmark = await createBookmark(db, {
      title: 'Concurrent Target',
      url: 'https://concurrent-update.example.com',
      tags: ['Old'],
    });
    await env.DB.prepare(`UPDATE bookmarks SET archived_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(bookmark.id)
      .run();
    await expect(
      updateBookmark(db, bookmark.id, { title: 'Should Fail', tags: ['New'] }),
    ).rejects.toMatchObject({ status: 400, code: 'validation_error' });
  });

  it('sets defensive headers on transfer export downloads and filters unsafe imported URLs', async () => {
    const response = await exports.default.fetch(`${API}/transfer/export?format=html`, {
      headers: adminHeaders,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toBe('sandbox');

    const jsonData = parseJson(
      JSON.stringify({
        version: 2,
        bookmarks: [
          { title: 'Unsafe', url: 'javascript:alert(1)' },
          {
            title: 'Safe',
            url: 'https://safe-import.example.com',
            iconUrl: 'javascript:alert(2)',
            addedAt: '不是合法日期',
          },
        ],
      }),
    );
    expect(jsonData.bookmarks).toHaveLength(1);
    expect(jsonData.bookmarks[0]).toMatchObject({
      title: 'Safe',
      url: 'https://safe-import.example.com',
      iconUrl: null,
      addedAt: null,
    });

    const htmlData = parseHtml(`<!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL><p>
        <DT><A HREF="javascript:alert(1)">Bookmarklet</A>
        <DT><A HREF='https://single-quote.example.com' ICON='https://single-quote.example.com/i.png'>Single Quote</A>
      </DL><p>`);
    expect(htmlData.bookmarks).toHaveLength(1);
    expect(htmlData.bookmarks[0]).toMatchObject({
      title: 'Single Quote',
      url: 'https://single-quote.example.com',
      iconUrl: 'https://single-quote.example.com/i.png',
    });
  });
});

describe('D1 query budgets', () => {
  it('fetches admin stats in a single SQL query', async () => {
    const { db, queries } = observeDb();
    const stats = await getAdminStats(db);
    expect(stats.bookmarks.total).toBe(0);
    expect(queries).toHaveLength(1);
  });

  it('reorders 100 categories with chunked CASE updates within D1 budgets', async () => {
    const seedDb = drizzle(env.DB);
    const ids: number[] = [];
    for (let index = 0; index < 100; index += 1) {
      const created = await createCategory(seedDb, { name: `排序分类${index}` });
      ids.push(created.id);
    }
    const reversed = [...ids].reverse();
    const { db, queries } = observeDb();
    await reorderCategories(db, reversed);

    const updateQueries = queries.filter((item) => item.query.toLowerCase().startsWith('update '));
    expect(updateQueries.length).toBeLessThanOrEqual(4);

    const ordered = await env.DB.prepare(
      'SELECT id, sort_order FROM categories ORDER BY sort_order ASC',
    ).all<{ id: number; sort_order: number }>();
    expect(ordered.results.map((row) => row.id)).toEqual(reversed);
  });

  it('batch-inserts 60 imported categories (including children) in minimal SQL queries', async () => {
    const categories = [
      ...Array.from({ length: 20 }, (_, index) => ({
        name: `根分类${index}`,
        slug: `root-${index}`,
        parentSlug: null,
        visibility: 'public' as const,
      })),
      ...Array.from({ length: 40 }, (_, index) => ({
        name: `子分类${index}`,
        slug: `child-${index}`,
        parentSlug: `root-${index % 20}`,
        visibility: 'public' as const,
      })),
    ];

    const { db, queries } = observeDb();
    await importTransferData(
      db,
      {
        version: 2,
        exportedAt: new Date().toISOString(),
        categories,
        bookmarks: [
          {
            title: 'Target',
            url: 'https://batch-cat.example.com',
            categorySlug: 'child-39',
            tags: [],
          },
        ],
      },
      'skip',
    );

    const categoryWrites = queries.filter((item) =>
      /^(insert|update)\s+.*"categories"/i.test(item.query),
    );
    expect(categoryWrites.length).toBeLessThanOrEqual(6);

    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM categories').first('count');
    expect(count).toBe(60);
    const linked = await env.DB.prepare(
      `SELECT p.slug AS parent_slug FROM categories c
       INNER JOIN categories p ON p.id = c.parent_id
       WHERE c.slug = 'child-39'`,
    ).first<{ parent_slug: string }>();
    expect(linked?.parent_slug).toBe('root-19');
  });
});
