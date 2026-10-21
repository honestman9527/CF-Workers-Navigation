import type { ImportSummary } from '../../src/shared/api/types';
import type { TransferBookmark, TransferData } from '../../src/worker/transfer/types';

import { env, exports } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../../src/worker/app';
import { importTransferData } from '../../src/worker/services/transfer';
import { exportTransferStream } from '../../src/worker/services/transfer-export';
import { detectFormat } from '../../src/worker/transfer/detect';
import { parseHtml } from '../../src/worker/transfer/html';
import { parseJson } from '../../src/worker/transfer/json';

const adminHeaders = {
  Authorization: 'Bearer dev-password',
  'Content-Type': 'application/json',
};

const htmlFixture = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>开发工具</H3>
    <DL><p>
        <DT><A HREF="https://transfer-github.example.com" ADD_DATE="1700000000">GitHub</A>
        <DD>Where the world builds software
        <DT><H3>前端</H3>
        <DL><p>
            <DT><A HREF="https://transfer-react.example.com">React</A>
        </DL><p>
    </DL><p>
</DL><p>`;

async function createBookmark(input: Record<string, unknown>) {
  const response = await exports.default.fetch('https://example.com/api/v1/bookmarks', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return response.json();
}

describe('transfer api', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM bookmark_tags'),
      env.DB.prepare('DELETE FROM bookmarks'),
      env.DB.prepare('DELETE FROM tags'),
      env.DB.prepare('DELETE FROM categories'),
    ]);
  });

  it('requires admin token for export and import', async () => {
    const exportResponse = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=json',
    );
    expect(exportResponse.status).toBe(401);
    const prepareResponse = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export/prepare?format=json',
    );
    expect(prepareResponse.status).toBe(401);
    const importResponse = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=html',
      { method: 'POST', headers: { 'Content-Type': 'text/html' }, body: htmlFixture },
    );
    expect(importResponse.status).toBe(401);
  });

  it('checks export readiness before starting a browser download', async () => {
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export/prepare?format=html',
      { headers: adminHeaders },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ready: true });
  });

  it('exports a flat versioned json backup with tags', async () => {
    await createBookmark({
      title: 'Tagged site',
      url: 'https://transfer-tagged.example.com',
      tags: ['开发', '常用'],
    });
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=json',
      { headers: { Authorization: 'Bearer dev-password' } },
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      version: number;
      bookmarks: Array<{ url: string; tags: string[] }>;
      categories?: unknown;
    };
    expect(data.version).toBe(2);
    expect(data.categories).toEqual([]);
    expect(data.bookmarks.find((bookmark) => bookmark.url.includes('tagged'))?.tags).toEqual([
      '开发',
      '常用',
    ]);
  });

  it('imports html folders as a category tree without tags', async () => {
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=html&strategy=skip',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-password', 'Content-Type': 'text/html' },
        body: htmlFixture,
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json<ImportSummary>()).bookmarksCreated).toBe(2);

    const catsResponse = await exports.default.fetch('https://example.com/api/v1/categories', {
      headers: { Authorization: 'Bearer dev-password' },
    });
    const cats = (await catsResponse.json()) as Array<{
      id: number;
      name: string;
      slug: string;
      parentId: number | null;
    }>;
    const dev = cats.find((item) => item.name === '开发工具');
    const frontend = cats.find((item) => item.name === '前端');
    expect(dev).toBeDefined();
    expect(frontend?.parentId).toBe(dev?.id);

    const bookmarksResponse = await exports.default.fetch(
      'https://example.com/api/v1/bookmarks?view=all',
      { headers: { Authorization: 'Bearer dev-password' } },
    );
    const page = (await bookmarksResponse.json()) as {
      items: Array<{ url: string; tags: string[]; categorySlug: string | null }>;
    };
    const github = page.items.find((bookmark) => bookmark.url.includes('github'));
    const react = page.items.find((bookmark) => bookmark.url.includes('react'));
    expect(github?.tags).toEqual([]);
    expect(github?.categorySlug).toBe(dev?.slug);
    expect(react?.tags).toEqual([]);
    expect(react?.categorySlug).toBe(frontend?.slug);
  });

  it('skips duplicate urls and updates tags on repeated imports', async () => {
    const payload = JSON.stringify({
      version: 1,
      bookmarks: [{ title: 'One', url: 'https://duplicate.example.com', tags: ['one'] }],
    });
    const first = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=skip',
      { method: 'POST', headers: adminHeaders, body: payload },
    );
    expect((await first.json<ImportSummary>()).bookmarksCreated).toBe(1);
    const second = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=update',
      {
        method: 'POST',
        headers: adminHeaders,
        body: payload.replace('one', 'updated'),
      },
    );
    expect((await second.json<ImportSummary>()).bookmarksUpdated).toBe(1);
  });

  it('imports backups larger than one D1 insert batch', async () => {
    const bookmarks = Array.from({ length: 25 }, (_, index) => ({
      title: `Batch import ${index}`,
      url: `https://batch-import-${index}.example.com`,
      tags: ['batch'],
    }));
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=skip',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ version: 1, bookmarks }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      bookmarksCreated: 25,
      bookmarksSkipped: 0,
      bookmarksUpdated: 0,
    });
  });

  it('retries a partial database failure without duplicating already imported rows', async () => {
    const payload = JSON.stringify({
      version: 2,
      bookmarks: Array.from({ length: 13 }, (_, index) => ({
        title: `Retry import ${index}`,
        url: `https://retry-import-${index}.example.com`,
        tags: ['Retry'],
      })),
    });
    let bookmarkBatches = 0;
    const db = drizzle(env.DB, {
      logger: {
        logQuery(query) {
          if (query.startsWith('insert into "bookmarks"') && ++bookmarkBatches === 2) {
            throw new Error('Second import batch failed');
          }
        },
      },
    });
    await expect(importTransferData(db, parseJson(payload), 'skip')).rejects.toThrow(
      'Second import batch failed',
    );
    const savedCount = Number(
      await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmarks').first('count'),
    );
    expect(savedCount).toBeGreaterThan(0);
    expect(savedCount).toBeLessThan(13);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmark_tags').first('count')).toBe(
      savedCount,
    );
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json',
      { method: 'POST', headers: adminHeaders, body: payload },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      bookmarksCreated: 13 - savedCount,
      bookmarksSkipped: savedCount,
    });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmarks').first('count')).toBe(13);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmark_tags').first('count')).toBe(
      13,
    );
  });

  it.each([
    { count: 25, strategy: 'skip', queryBudget: 4 },
    { count: 100, strategy: 'update', queryBudget: 6 },
  ] as const)(
    'retains the tag query budget for $count bookmarks with $strategy',
    async ({ count, strategy, queryBudget }) => {
      const data = parseJson(
        JSON.stringify({
          version: 2,
          bookmarks: Array.from({ length: count }, (_, index) => ({
            title: `Budget ${index}`,
            url: `https://tag-budget-${index}.example.com`,
            visibility: 'private',
            tags: ['Shared'],
          })),
        }),
      );
      if (strategy === 'update') await importTransferData(drizzle(env.DB), data, 'skip');
      let tagQueries = 0;
      const db = drizzle(env.DB, {
        logger: {
          logQuery(query, params) {
            expect(params.length).toBeLessThanOrEqual(100);
            if (/"(?:bookmark_tags|tags)"/.test(query)) tagQueries += 1;
          },
        },
      });
      const summary = await importTransferData(db, data, strategy);
      expect(summary).toMatchObject(
        strategy === 'skip'
          ? { bookmarksCreated: count, bookmarksUpdated: 0 }
          : { bookmarksCreated: 0, bookmarksUpdated: count },
      );
      expect(tagQueries).toBeLessThanOrEqual(queryBudget);
      expect(
        await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmark_tags').first('count'),
      ).toBe(count);
    },
  );

  it('logs both bookmark and tag failures, returns the existing 500, and can be repaired with update', async () => {
    const payload = JSON.stringify({
      version: 2,
      bookmarks: Array.from({ length: 13 }, (_, index) => ({
        title: `Double failure ${index}`,
        url: `https://double-failure-${index}.example.com`,
        tags: ['Recovered'],
      })),
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await env.DB.batch([
        env.DB.prepare(`CREATE TRIGGER fail_bookmark_batch BEFORE INSERT ON bookmarks
          WHEN NEW.title = 'Double failure 9'
          BEGIN SELECT RAISE(ABORT, 'Bookmark batch failure'); END`),
        env.DB.prepare(`CREATE TRIGGER fail_tag_cleanup BEFORE INSERT ON tags
          BEGIN SELECT RAISE(ABORT, 'Tag cleanup failure'); END`),
      ]);
      const response = await app.fetch(
        new Request('https://example.com/api/v1/transfer/import?format=json', {
          method: 'POST',
          headers: adminHeaders,
          body: payload,
        }),
        env,
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: 'internal_error', message: '数据库写入失败，请查看 Worker 日志' },
      });
      const logged = errorLog.mock.calls.find(([message]) => message === 'Bookmark import failed');
      expect(logged).toEqual([
        'Bookmark import failed',
        expect.objectContaining({
          cause: expect.objectContaining({
            message: expect.stringContaining('Bookmark batch failure'),
          }),
        }),
        expect.objectContaining({
          cause: expect.objectContaining({
            message: expect.stringContaining('Tag cleanup failure'),
          }),
        }),
      ]);
      expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmarks').first('count')).toBe(
        9,
      );
      expect(
        await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmark_tags').first('count'),
      ).toBe(0);
    } finally {
      errorLog.mockRestore();
      await env.DB.batch([
        env.DB.prepare('DROP TRIGGER IF EXISTS fail_bookmark_batch'),
        env.DB.prepare('DROP TRIGGER IF EXISTS fail_tag_cleanup'),
      ]);
    }
    const retried = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=update',
      { method: 'POST', headers: adminHeaders, body: payload },
    );
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({ bookmarksCreated: 4, bookmarksUpdated: 9 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmark_tags').first('count')).toBe(
      13,
    );
  });

  it('restores active and every deleted record sharing a normalized URL without duplication', async () => {
    const shared = {
      url: 'https://restore-duplicates.example.com/path',
      addedAt: '2024-01-01T00:00:00.000Z',
      tags: ['Backup'],
    };
    const payload = JSON.stringify({
      version: 2,
      categories: [{ name: 'Restore', slug: 'restore', visibility: 'public' }],
      bookmarks: [
        { ...shared, title: 'Active', categorySlug: 'restore', visibility: 'public' },
        {
          ...shared,
          title: 'Deleted one',
          deletedAt: '2024-01-02T00:00:00.000Z',
          categorySlug: 'restore',
          visibility: 'private',
        },
        {
          ...shared,
          title: 'Deleted two with the same identity',
          url: 'https://RESTORE-duplicates.example.com/path/#old',
          deletedAt: '2024-01-02T00:00:00.000Z',
        },
        { ...shared, title: 'Deleted later', deletedAt: '2024-01-03T00:00:00.000Z' },
        {
          title: 'Archived',
          url: 'https://restore-archived.example.com',
          archivedAt: '2024-01-04T00:00:00.000Z',
          tags: [],
        },
      ],
    });
    const requestImport = (body: string) =>
      exports.default.fetch('https://example.com/api/v1/transfer/import?format=json', {
        method: 'POST',
        headers: adminHeaders,
        body,
      });
    const first = await requestImport(payload);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ bookmarksCreated: 5, bookmarksSkipped: 0 });
    const exported = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=json',
      { headers: adminHeaders },
    );
    const backup = await exported.text();
    const before = parseJson(backup).bookmarks;
    expect(before).toHaveLength(5);

    await env.DB.prepare('DELETE FROM bookmarks').run();
    await env.DB.prepare('DELETE FROM categories').run();
    const restored = await requestImport(backup);
    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ bookmarksCreated: 5, bookmarksSkipped: 0 });
    const repeated = await requestImport(backup);
    expect(await repeated.json()).toMatchObject({ bookmarksCreated: 0, bookmarksSkipped: 5 });
    const afterResponse = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=json',
      { headers: adminHeaders },
    );
    const after = parseJson(await afterResponse.text()).bookmarks;
    const sortByTitle = (rows: typeof before) =>
      rows.sort((a, b) => a.title.localeCompare(b.title));
    expect(sortByTitle(after)).toEqual(sortByTitle(before));
  });

  it('updates the live URL while leaving deleted history untouched', async () => {
    const original = JSON.stringify({
      version: 2,
      bookmarks: [
        { title: 'Live', url: 'https://update-live.example.com', tags: ['live'] },
        {
          title: 'History',
          url: 'https://update-live.example.com',
          deletedAt: '2024-01-02T00:00:00.000Z',
          addedAt: '2024-01-01T00:00:00.000Z',
          tags: ['history'],
        },
      ],
    });
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json',
      { method: 'POST', headers: adminHeaders, body: original },
    );
    expect(response.status).toBe(200);
    const updated = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=update',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          version: 2,
          bookmarks: [
            { title: 'Updated live', url: 'https://update-live.example.com', tags: ['updated'] },
          ],
        }),
      },
    );
    expect(await updated.json()).toMatchObject({ bookmarksUpdated: 1, bookmarksCreated: 0 });
    const backup = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=json',
      { headers: adminHeaders },
    );
    expect(parseJson(await backup.text()).bookmarks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Updated live', deletedAt: null, tags: ['updated'] }),
        expect.objectContaining({
          title: 'History',
          deletedAt: '2024-01-02T00:00:00.000Z',
          tags: ['history'],
        }),
      ]),
    );
  });

  it('creates a live URL when only deleted history exists and reimports legacy history once', async () => {
    const original = JSON.stringify({
      version: 1,
      bookmarks: [
        {
          title: 'Legacy history',
          url: 'https://legacy-history.example.com',
          deletedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });
    for (const expectedCreated of [1, 0]) {
      const response = await exports.default.fetch(
        'https://example.com/api/v1/transfer/import?format=json',
        { method: 'POST', headers: adminHeaders, body: original },
      );
      expect(await response.json()).toMatchObject({ bookmarksCreated: expectedCreated });
    }
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=update',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          bookmarks: [{ title: 'New live', url: 'https://legacy-history.example.com' }],
        }),
      },
    );
    expect(await response.json()).toMatchObject({ bookmarksCreated: 1, bookmarksUpdated: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmarks').first('count')).toBe(2);
  });

  it.each([
    { strategy: 'skip', legacyFirst: true },
    { strategy: 'skip', legacyFirst: false },
    { strategy: 'create', legacyFirst: true },
    { strategy: 'create', legacyFirst: false },
    { strategy: 'update', legacyFirst: true },
    { strategy: 'update', legacyFirst: false },
  ])(
    'reserves exact deleted identities for $strategy with legacy first: $legacyFirst',
    async ({ strategy, legacyFirst }) => {
      const common = {
        url: 'https://mixed-history.example.com',
        deletedAt: '2024-01-02T00:00:00.000Z',
        tags: [],
      };
      const history = [
        { ...common, title: 'Legacy history' },
        { ...common, title: 'Exact history', addedAt: '2024-01-01T00:00:00.000Z' },
      ];
      const payload = JSON.stringify({
        version: 2,
        bookmarks: legacyFirst ? history : history.toReversed(),
      });
      for (const expectedCreated of [2, 0, 0]) {
        const response = await exports.default.fetch(
          `https://example.com/api/v1/transfer/import?format=json&strategy=${strategy}`,
          { method: 'POST', headers: adminHeaders, body: payload },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ bookmarksCreated: expectedCreated });
        expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmarks').first('count')).toBe(
          2,
        );
      }
      const rows = await env.DB.prepare('SELECT title, created_at FROM bookmarks').all<{
        title: string;
        created_at: string;
      }>();
      expect(rows.results).toEqual(
        expect.arrayContaining([
          { title: 'Exact history', created_at: '2024-01-01T00:00:00.000Z' },
          expect.objectContaining({ title: 'Legacy history' }),
        ]),
      );
    },
  );

  it.each([
    {
      name: 'bookmark reference',
      categories: [{ name: 'New category', slug: 'new-category' }],
      bookmarks: [
        { title: 'Missing category', url: 'https://bad-ref.example.com', categorySlug: 'missing' },
      ],
    },
    {
      name: 'parent reference',
      categories: [{ name: 'New category', slug: 'new-category', parentSlug: 'missing' }],
      bookmarks: [],
    },
    {
      name: 'category cycle',
      categories: [
        { name: 'First', slug: 'first', parentSlug: 'second' },
        { name: 'Second', slug: 'second', parentSlug: 'first' },
      ],
      bookmarks: [],
    },
  ])('validates every $name before creating any records', async ({ categories, bookmarks }) => {
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ version: 2, categories, bookmarks }),
      },
    );
    expect(response.status).toBe(400);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM categories').first('count')).toBe(0);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmarks').first('count')).toBe(0);
  });

  it.each([undefined, '1'])(
    'cancels an oversized body regardless of Content-Length %s',
    async (length) => {
      const chunk = new Uint8Array(1024 * 1024);
      let reads = 0;
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            reads += 1;
            controller.enqueue(chunk);
          },
          cancel,
        },
        { highWaterMark: 0 },
      );
      const response = await app.fetch(
        new Request('https://example.com/api/v1/transfer/import?format=json', {
          method: 'POST',
          headers: { ...adminHeaders, ...(length ? { 'Content-Length': length } : {}) },
          body,
        }),
        env,
      );
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ error: { code: 'too_large' } });
      expect(reads).toBe(11);
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it('accepts exactly 10 MB and decodes a UTF-8 character split across body chunks', async () => {
    const encoder = new TextEncoder();
    const json = encoder.encode(
      JSON.stringify({ bookmarks: [{ title: '中文', url: 'https://chunked-utf8.example.com' }] }),
    );
    const split = json.indexOf(0xe4) + 1;
    const chunks = [
      json.slice(0, split),
      json.slice(split),
      new Uint8Array(10 * 1024 * 1024 - json.byteLength).fill(32),
    ];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const response = await app.fetch(
      new Request('https://example.com/api/v1/transfer/import?format=json', {
        method: 'POST',
        headers: adminHeaders,
        body,
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ bookmarksCreated: 1 });
    expect(await env.DB.prepare('SELECT title FROM bookmarks').first('title')).toBe('中文');
  });

  it('streams multiple pages of JSON and HTML without losing categories or tags', async () => {
    const bookmarks = Array.from({ length: 601 }, (_, index) => ({
      title: `Stream site ${index}`,
      url: `https://stream-${index}.example.com`,
      categorySlug: 'stream-root',
      tags: ['Shared', `Tag ${index % 3}`],
      visibility: index % 2 === 0 ? 'public' : 'private',
    }));
    const importResponse = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=skip',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          version: 2,
          categories: [{ name: 'Stream root', slug: 'stream-root', visibility: 'public' }],
          bookmarks,
        }),
      },
    );
    expect(importResponse.status).toBe(200);
    expect((await importResponse.json<ImportSummary>()).bookmarksCreated).toBe(601);

    const jsonResponse = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=json',
      { headers: adminHeaders },
    );
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.body).not.toBeNull();
    const json = parseJson(await jsonResponse.text());
    expect(json.version).toBe(2);
    const exported = json.bookmarks.filter((bookmark) => bookmark.url.includes('stream-'));
    expect(exported).toHaveLength(601);
    expect(exported.every((bookmark) => bookmark.tags.includes('Shared'))).toBe(true);
    expect(exported.filter((bookmark) => bookmark.visibility === 'private')).toHaveLength(300);

    const htmlResponse = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=html',
      { headers: adminHeaders },
    );
    expect(htmlResponse.status).toBe(200);
    const html = parseHtml(await htmlResponse.text());
    const htmlBookmarks = html.bookmarks.filter((bookmark) => bookmark.url.includes('stream-'));
    expect(htmlBookmarks).toHaveLength(601);
    expect(htmlBookmarks.every((bookmark) => bookmark.categorySlug === 'stream-root')).toBe(true);
  });

  it.each(['json', 'html'] as const)(
    'fails the %s download when its second page cannot be read',
    async (format) => {
      const response = await exports.default.fetch(
        'https://example.com/api/v1/transfer/import?format=json',
        {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({
            bookmarks: Array.from({ length: 301 }, (_, index) => ({
              title: `Failure page ${index}`,
              url: `https://failure-page-${index}.example.com`,
            })),
          }),
        },
      );
      expect(response.status).toBe(200);
      const db = drizzle(env.DB, {
        logger: {
          logQuery(query) {
            if (query.includes('bookmark_page') && query.includes('b.created_at <')) {
              throw new Error('Second export page failed');
            }
          },
        },
      });
      const stream = await exportTransferStream(db, format);
      await expect(new Response(stream).text()).rejects.toThrow('Second export page failed');
      const recovered = await exports.default.fetch(
        `https://example.com/api/v1/transfer/export?format=${format}`,
        { headers: adminHeaders },
      );
      const text = await recovered.text();
      expect((format === 'json' ? parseJson(text) : parseHtml(text)).bookmarks).toHaveLength(301);
    },
  );

  it('imports more than one tag statement worth of distinct tags', async () => {
    const bookmarks = Array.from({ length: 4 }, (_, index) => ({
      title: `Many tags ${index}`,
      url: `https://many-tags-${index}.example.com`,
      tags: Array.from({ length: 30 }, (_, tag) => `Tag ${index}-${tag}`),
    }));
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=skip',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ version: 1, bookmarks }),
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json<ImportSummary>()).bookmarksCreated).toBe(4);
    const tagsResponse = await exports.default.fetch('https://example.com/api/v1/tags', {
      headers: adminHeaders,
    });
    const tags = await tagsResponse.json<Array<{ name: string }>>();
    expect(tags.filter((tag) => /^Tag [0-3]-\d+$/.test(tag.name))).toHaveLength(120);
  });

  it('streams nested and empty HTML folders with uncategorized bookmarks', async () => {
    const importResponse = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=skip',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          version: 2,
          categories: [
            { name: 'Stream parent', slug: 'stream-parent' },
            { name: 'Stream child', slug: 'stream-child', parentSlug: 'stream-parent' },
            { name: 'Stream empty', slug: 'stream-empty' },
          ],
          bookmarks: [
            {
              title: 'Nested',
              url: 'https://nested-stream.example.com',
              categorySlug: 'stream-child',
            },
            { title: 'Loose', url: 'https://loose-stream.example.com' },
          ],
        }),
      },
    );
    expect(importResponse.status).toBe(200);
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=html',
      { headers: adminHeaders },
    );
    expect(response.status).toBe(200);
    const parsed = parseHtml(await response.text());
    expect(parsed.bookmarks).toHaveLength(2);
    expect(new Set(parsed.bookmarks.map((bookmark) => bookmark.url)).size).toBe(2);
    expect(parsed.categories?.find((item) => item.slug === 'stream-child')?.parentSlug).toBe(
      'stream-parent',
    );
    expect(parsed.categories?.some((item) => item.slug === 'stream-empty')).toBe(true);
    expect(parsed.bookmarks.find((item) => item.url.includes('nested-stream'))?.categorySlug).toBe(
      'stream-child',
    );
    expect(
      parsed.bookmarks.find((item) => item.url.includes('loose-stream'))?.categorySlug,
    ).toBeNull();
  });

  it('exports categories and bookmark category slugs', async () => {
    const categoryResponse = await exports.default.fetch('https://example.com/api/v1/categories', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: '备份分类' }),
    });
    const category = await categoryResponse.json<{ id: number; slug: string }>();
    await createBookmark({
      title: 'Categorized export',
      url: 'https://categorized-export.example.com',
      categoryId: category.id,
    });

    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=json',
      { headers: { Authorization: 'Bearer dev-password' } },
    );
    const data = (await response.json()) as {
      categories: Array<{ name: string; slug: string }>;
      bookmarks: Array<{ url: string; categorySlug?: string }>;
    };
    expect(data.categories.some((item) => item.slug === category.slug)).toBe(true);
    expect(
      data.bookmarks.find((bookmark) => bookmark.url.includes('categorized-export'))?.categorySlug,
    ).toBe(category.slug);
  });

  it('exports the exact backup projection with original timestamps, explicit privacy, and null fields', async () => {
    const categories = [
      {
        name: 'Private root',
        slug: 'backup-root',
        parentSlug: null,
        icon: null,
        visibility: 'private',
      },
      {
        name: 'Child',
        slug: 'backup-child',
        parentSlug: 'backup-root',
        icon: 'Folder',
        visibility: 'public',
      },
    ];
    const rich = {
      title: 'Rich & historical',
      visibility: 'public',
      url: 'https://rich-backup.example.com/path#hash',
      description: 'A description <with> & symbols',
      iconUrl: 'https://icons.example.com/rich.png',
      isPinned: true,
      categorySlug: 'backup-child',
      tags: ['Docs', 'Design'],
      archivedAt: '2026-09-02T11:12:13.123Z',
      deletedAt: '2026-09-03T12:13:14.456Z',
      addedAt: '2026-09-01T10:11:12.345Z',
    } satisfies TransferBookmark;
    const empty = {
      title: 'Empty fields',
      visibility: 'private',
      url: 'https://empty-backup.example.com',
      description: null,
      iconUrl: null,
      isPinned: false,
      categorySlug: null,
      tags: [],
      archivedAt: null,
      deletedAt: null,
      addedAt: '2026-09-04 00:00:00',
    } satisfies TransferBookmark;
    const imported = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          version: 2,
          categories,
          bookmarks: [rich, empty],
        }),
      },
    );
    expect(imported.status).toBe(200);
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=json',
      {
        headers: adminHeaders,
      },
    );
    expect(response.status).toBe(200);
    const data = await response.json<TransferData>();
    expect(Object.keys(data).sort()).toEqual(['bookmarks', 'categories', 'exportedAt', 'version']);
    expect(data.version).toBe(2);
    expect(Number.isFinite(Date.parse(data.exportedAt))).toBe(true);
    expect(data.categories).toEqual(categories);
    expect(data.bookmarks).toHaveLength(2);
    for (const expected of [rich, empty]) {
      const record = data.bookmarks.find((bookmark) => bookmark.url === expected.url);
      expect(record && { ...record, tags: record.tags.toSorted() }).toEqual({
        ...expected,
        tags: expected.tags.toSorted(),
      });
    }
  });

  it('imports a category tree and restores bookmark assignment', async () => {
    const payload = JSON.stringify({
      version: 1,
      categories: [
        { name: '导入根', slug: 'import-root', parentSlug: null },
        { name: '导入子', slug: 'import-child', parentSlug: 'import-root' },
      ],
      bookmarks: [
        {
          title: 'In child',
          url: 'https://import-child.example.com',
          categorySlug: 'import-child',
        },
      ],
    });
    const response = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=skip',
      { method: 'POST', headers: adminHeaders, body: payload },
    );
    expect(response.status).toBe(200);
    expect((await response.json<ImportSummary>()).bookmarksCreated).toBe(1);

    const catsResponse = await exports.default.fetch('https://example.com/api/v1/categories', {
      headers: { Authorization: 'Bearer dev-password' },
    });
    const cats = (await catsResponse.json()) as Array<{
      id: number;
      name: string;
      slug: string;
      parentId: number | null;
    }>;
    const root = cats.find((item) => item.slug === 'import-root');
    const child = cats.find((item) => item.slug === 'import-child');
    expect(child?.parentId).toBe(root?.id);

    const page = await exports.default.fetch(
      'https://example.com/api/v1/bookmarks?category=import-root',
      { headers: { Authorization: 'Bearer dev-password' } },
    );
    const { items } = (await page.json()) as { items: Array<{ url: string }> };
    expect(items.some((bookmark) => bookmark.url.includes('import-child.example.com'))).toBe(true);
  });
});

describe('parseJson tag backup', () => {
  it('normalizes legacy bookmark fields and tags', () => {
    const data = parseJson(
      JSON.stringify({
        exportedAt: '2024-01-01T00:00:00.000Z',
        bookmarks: [{ title: 'N', url: 'n.example.com', tags: [' A ', 'a', 1] }],
      }),
    );
    expect(data.version).toBe(1);
    expect(data.bookmarks[0]).toMatchObject({
      title: 'N',
      url: 'https://n.example.com',
      tags: ['A'],
    });
  });

  it('defaults missing tags and title', () => {
    const data = parseJson(JSON.stringify({ bookmarks: [{ url: 'https://example.com' }] }));
    expect(data.bookmarks[0].title).toBe('未命名书签');
    expect(data.bookmarks[0].tags).toEqual([]);
  });

  it('rejects old category-shaped backups', () => {
    expect(() =>
      parseJson(JSON.stringify({ categories: [{ name: 'Old', bookmarks: [] }] })),
    ).toThrow(/旧分类格式已不再支持/);
    expect(() => parseJson(JSON.stringify([{ name: 'Old', bookmarks: [] }]))).toThrow(
      /旧分类格式已不再支持/,
    );
  });

  it('reports malformed json in chinese', () => {
    expect(() => parseJson('{ not valid json')).toThrow(/JSON 格式有误/);
  });
});

describe('html transfer', () => {
  it('keeps same-name folders distinct across parents and within the same parent', () => {
    const input = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
<DT><H3>First</H3>
<DL><p>
<DT><H3>Shared</H3>
<DL><p>
<DT><A HREF="https://first-shared.example.com">First shared</A>
</DL><p>
<DT><H3>Shared</H3>
<DL><p>
<DT><A HREF="https://first-shared-again.example.com">First shared again</A>
</DL><p>
</DL><p>
<DT><H3>Second</H3>
<DL><p>
<DT><H3>Shared</H3>
<DL><p>
<DT><A HREF="https://second-shared.example.com">Second shared</A>
</DL><p>
</DL><p>
</DL><p>`;
    const data = parseHtml(input);
    expect(data.categories).toEqual([
      { name: 'First', slug: 'first', parentSlug: null },
      { name: 'Shared', slug: 'shared', parentSlug: 'first' },
      { name: 'Shared', slug: 'shared-2', parentSlug: 'first' },
      { name: 'Second', slug: 'second', parentSlug: null },
      { name: 'Shared', slug: 'shared-3', parentSlug: 'second' },
    ]);
    expect(data.bookmarks.map((bookmark) => bookmark.categorySlug)).toEqual([
      'shared',
      'shared-2',
      'shared-3',
    ]);
    expect(parseHtml(input).categories).toEqual(data.categories);
  });

  it('reserves suffixes and keeps long or punctuation-only folder names usable', () => {
    const name = 'A'.repeat(80);
    const folders = ['Shared', 'Shared', 'Shared-2', name, name, '!!!'];
    const input = `<DL><p>\n${folders.map((folder, index) => `<DT><H3>${folder}</H3>\n<DL><p>\n<DT><A HREF="https://folder-${index}.example.com">Site</A>\n</DL><p>`).join('\n')}\n</DL><p>`;
    const data = parseHtml(input);
    const slugs = data.categories!.map((category) => category.slug!);
    expect(new Set(slugs).size).toBe(folders.length);
    expect(slugs.every((slug) => slug.length <= 64)).toBe(true);
    expect(slugs.slice(0, 3)).toEqual(['shared', 'shared-2', 'shared-2-2']);
    expect(slugs.at(-1)).toBe('folder');
    expect(data.bookmarks.map((bookmark) => bookmark.categorySlug)).toEqual(slugs);
  });

  it('parseHtml maps nested folders to a category tree without tags', () => {
    const data = parseHtml(htmlFixture);
    expect(data.categories).toEqual([
      { name: '开发工具', slug: '开发工具', parentSlug: null },
      { name: '前端', slug: '前端', parentSlug: '开发工具' },
    ]);
    expect(data.bookmarks).toHaveLength(2);
    const github = data.bookmarks.find((bookmark) => bookmark.url.includes('github'));
    const react = data.bookmarks.find((bookmark) => bookmark.url.includes('react'));
    expect(github).toMatchObject({ categorySlug: '开发工具', tags: [] });
    expect(github?.description).toBe('Where the world builds software');
    expect(github?.addedAt).toBe(new Date(1700000000 * 1000).toISOString());
    expect(react).toMatchObject({ categorySlug: '前端', tags: [] });
  });

  it('parseHtml treats a 未分类 folder as uncategorized', () => {
    const input = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>未分类</H3>
    <DL><p>
        <DT><A HREF="https://uncategorized.example.com">Loose</A>
    </DL><p>
</DL><p>`;
    const data = parseHtml(input);
    expect(data.categories).toBeUndefined();
    expect(data.bookmarks[0]).toMatchObject({ categorySlug: null, tags: [] });
  });
});

describe('detectFormat', () => {
  it('detects json and html', () => {
    expect(detectFormat('x.json', '{"version":1,"bookmarks":[]}')).toBe('json');
    expect(detectFormat('bookmarks.html', '<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe('html');
  });

  it('throws for unrecognized content', () => {
    expect(() => detectFormat('file.txt', 'plain text')).toThrow(/无法识别|格式/);
  });
});
