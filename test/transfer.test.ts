import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { detectFormat } from '../src/worker/transfer/detect';
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

  it('imports html folders as tags without creating folder nodes', async () => {
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

    const bookmarksResponse = await exports.default.fetch(
      'https://example.com/api/v1/bookmarks?view=all',
      { headers: { Authorization: 'Bearer dev-password' } },
    );
    const page = (await bookmarksResponse.json()) as {
      items: Array<{ url: string; tags: string[] }>;
    };
    expect(page.items.find((bookmark) => bookmark.url.includes('github'))?.tags).toEqual([
      '开发工具',
    ]);
    expect(page.items.find((bookmark) => bookmark.url.includes('react'))?.tags).toEqual([
      '开发工具',
      '前端',
    ]);
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

describe('detectFormat', () => {
  it('detects json and html', () => {
    expect(detectFormat('x.json', '{"version":1,"bookmarks":[]}')).toBe('json');
    expect(detectFormat('bookmarks.html', '<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe('html');
  });

  it('throws for unrecognized content', () => {
    expect(() => detectFormat('file.txt', 'plain text')).toThrow(/无法识别|格式/);
  });
});
