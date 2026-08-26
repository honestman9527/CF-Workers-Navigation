import type { TransferData } from '../src/worker/transfer/types';

import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { detectFormat } from '../src/worker/transfer/detect';
import { parseHtml, serializeHtml } from '../src/worker/transfer/html';
import { parseJson } from '../src/worker/transfer/json';

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
  it('requires admin token for export and import', async () => {
    const exportResponse = await exports.default.fetch(
      'https://example.com/api/v1/transfer/export?format=json',
    );
    expect(exportResponse.status).toBe(401);
    const importResponse = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=html',
      { method: 'POST', headers: { 'Content-Type': 'text/html' }, body: htmlFixture },
    );
    expect(importResponse.status).toBe(401);
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
    expect(data.version).toBe(1);
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
    expect((await response.json()).bookmarksCreated).toBe(2);

    const catsResponse = await exports.default.fetch('https://example.com/api/v1/categories', {
      headers: { Authorization: 'Bearer dev-password' },
    });
    const cats = (await catsResponse.json()) as Array<{
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
    expect((await first.json()).bookmarksCreated).toBe(1);
    const second = await exports.default.fetch(
      'https://example.com/api/v1/transfer/import?format=json&strategy=update',
      {
        method: 'POST',
        headers: adminHeaders,
        body: payload.replace('one', 'updated'),
      },
    );
    expect((await second.json()).bookmarksUpdated).toBe(1);
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
    expect((await response.json()).bookmarksCreated).toBe(1);

    const catsResponse = await exports.default.fetch('https://example.com/api/v1/categories', {
      headers: { Authorization: 'Bearer dev-password' },
    });
    const cats = (await catsResponse.json()) as Array<{
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

  it('serializeHtml groups by category tree and leaves tags out', () => {
    const data: TransferData = {
      version: 1,
      exportedAt: '2024-01-01T00:00:00.000Z',
      categories: [
        { name: '开发', slug: 'dev', parentSlug: null },
        { name: '前端', slug: 'frontend', parentSlug: 'dev' },
      ],
      bookmarks: [
        { title: 'Loose', url: 'https://loose.example.com', tags: ['x'] },
        { title: 'Dev site', url: 'https://dev.example.com', categorySlug: 'dev', tags: ['y'] },
        { title: 'Fe site', url: 'https://fe.example.com', categorySlug: 'frontend', tags: [] },
      ],
    };
    const html = serializeHtml(data);
    expect(html).toContain('<DT><H3>开发</H3>');
    expect(html).toContain('<DT><H3>前端</H3>');
    expect(html).toContain('<DT><H3>未分类</H3>');
    expect(html).not.toContain('TAGS=');
    // 每个书签只出现一次（不再按标签重复），未分类书签不落入分类文件夹
    expect(html.match(/loose\.example\.com/g)).toHaveLength(1);
    expect(html.match(/dev\.example\.com/g)).toHaveLength(1);
    const devBlock = html.slice(html.indexOf('<DT><H3>开发</H3>'));
    expect(devBlock.slice(0, devBlock.indexOf('</DL><p>') + 8)).not.toContain('loose.example.com');
  });

  it('serializeHtml round-trips through parseHtml', () => {
    const data: TransferData = {
      version: 1,
      exportedAt: '2024-01-01T00:00:00.000Z',
      categories: [
        { name: '开发', slug: 'dev', parentSlug: null },
        { name: '前端', slug: 'frontend', parentSlug: 'dev' },
      ],
      bookmarks: [
        { title: 'Loose', url: 'https://loose.example.com' },
        { title: 'Dev site', url: 'https://dev.example.com', categorySlug: 'dev' },
        { title: 'Fe site', url: 'https://fe.example.com', categorySlug: 'frontend' },
      ],
    };
    const parsed = parseHtml(serializeHtml(data));
    const byName = new Map((parsed.categories ?? []).map((category) => [category.name, category]));
    expect(byName.size).toBe(2);
    expect(byName.get('前端')?.parentSlug).toBe('开发');
    const byUrl = new Map(parsed.bookmarks.map((bookmark) => [bookmark.url, bookmark]));
    expect(byUrl.get('https://loose.example.com')?.categorySlug).toBeNull();
    expect(byUrl.get('https://dev.example.com')?.categorySlug).toBe('开发');
    expect(byUrl.get('https://fe.example.com')?.categorySlug).toBe('前端');
    expect(parsed.bookmarks.every((bookmark) => bookmark.tags.length === 0)).toBe(true);
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
