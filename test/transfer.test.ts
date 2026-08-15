import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { detectFormat } from '../src/worker/transfer/detect';
import { parseJson } from '../src/worker/transfer/json';

const adminHeaders = {
  Authorization: 'Bearer dev-password',
  'Content-Type': 'application/json',
};

const htmlFixture = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>开发工具</H3>
    <DL><p>
        <DT><A HREF="https://transfer-github.example.com" ICON="https://transfer-github.example.com/favicon.ico" ADD_DATE="1700000000">GitHub</A>
        <DD>Where the world builds software
        <DT><A HREF="https://transfer-vscode.example.com" ICON_URI="https://transfer-vscode.example.com/favicon.ico" ADD_DATE="1700000100">VS Code</A>
        <DT><H3>前端</H3>
        <DL><p>
            <DT><A HREF="https://transfer-react.example.com" ADD_DATE="1700000200">React</A>
            <DD>The library for web and native user interfaces
        </DL><p>
    </DL><p>
    <DT><H3>云服务</H3>
    <DL><p>
        <DT><A HREF="https://transfer-cloudflare.example.com" ICON="https://transfer-cloudflare.example.com/favicon.ico" ADD_DATE="1700000300">Cloudflare</A>
        <DT><A HREF="https://transfer-aws.example.com" ADD_DATE="1700000400">AWS</A>
    </DL><p>
</DL><p>`;

async function createCategory(name: string): Promise<{ id: number }> {
  const response = await exports.default.fetch('https://example.com/api/categories', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: number };
}

async function createBookmark(input: Record<string, unknown>): Promise<{ id: number }> {
  const response = await exports.default.fetch('https://example.com/api/bookmarks', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: number };
}

describe('transfer api', () => {
  it('requires admin token for export and import', async () => {
    const exportResponse = await exports.default.fetch(
      'https://example.com/api/transfer/export?format=json',
    );
    expect(exportResponse.status).toBe(401);

    const importResponse = await exports.default.fetch(
      'https://example.com/api/transfer/import?format=html',
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/html' },
        body: '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      },
    );
    expect(importResponse.status).toBe(401);
  });

  it('rejects unknown format query values', async () => {
    const response = await exports.default.fetch(
      'https://example.com/api/transfer/export?format=csv',
      {
        headers: { Authorization: 'Bearer dev-password' },
      },
    );
    expect(response.status).toBe(400);
  });

  it('exports nested categories and bookmarks as json', async () => {
    const parent = await createCategory('export-parent');
    const child = await exports.default.fetch('https://example.com/api/categories', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'export-child', parentId: parent.id }),
    });
    expect(child.status).toBe(201);
    const childCategory = (await child.json()) as { id: number };

    await createBookmark({
      categoryId: parent.id,
      title: 'Public Site',
      url: 'https://export-public.example.com',
    });
    await createBookmark({
      categoryId: childCategory.id,
      title: 'Nested Site',
      url: 'https://export-private.example.com',
    });

    const response = await exports.default.fetch(
      'https://example.com/api/transfer/export?format=json',
      {
        headers: { Authorization: 'Bearer dev-password' },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Content-Disposition')).toContain('nav-export-');

    const data = (await response.json()) as {
      categories: Array<{
        name: string;
        children: Array<{
          name: string;
          bookmarks: Array<{ title: string; url: string }>;
        }>;
        bookmarks: Array<{ title: string; url: string }>;
      }>;
    };

    const parentCategory = data.categories.find((category) => category.name === 'export-parent');
    expect(parentCategory).toBeDefined();
    expect(
      parentCategory!.bookmarks.some(
        (bookmark) => bookmark.url === 'https://export-public.example.com',
      ),
    ).toBe(true);
    const nestedChild = parentCategory!.children.find(
      (category) => category.name === 'export-child',
    );
    expect(nestedChild).toBeDefined();
    expect(
      nestedChild!.bookmarks.some(
        (bookmark) => bookmark.url === 'https://export-private.example.com',
      ),
    ).toBe(true);
  });

  it('imports a netscape html fixture and recreates the folder tree', async () => {
    const response = await exports.default.fetch(
      'https://example.com/api/transfer/import?format=html&strategy=skip',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-password', 'Content-Type': 'text/html' },
        body: htmlFixture,
      },
    );
    expect(response.status).toBe(200);

    const summary = (await response.json()) as {
      categoriesCreated: number;
      categoriesReused: number;
      bookmarksCreated: number;
      bookmarksSkipped: number;
    };
    expect(summary.categoriesCreated).toBeGreaterThanOrEqual(3);
    expect(summary.bookmarksCreated).toBe(5);

    const treeResponse = await exports.default.fetch('https://example.com/api/categories', {
      headers: { Authorization: 'Bearer dev-password' },
    });
    const tree = (await treeResponse.json()) as Array<{
      name: string;
      children: Array<{
        name: string;
        children: Array<{ name: string; bookmarks: unknown[] }>;
        bookmarks: unknown[];
      }>;
      bookmarks: unknown[];
    }>;
    const dev = tree.find((category) => category.name === '开发工具');
    expect(dev).toBeDefined();
    const frontend = dev!.children.find((category) => category.name === '前端');
    expect(frontend).toBeDefined();
  });

  it('skips duplicate urls on repeated import with strategy=skip', async () => {
    await exports.default.fetch(
      'https://example.com/api/transfer/import?format=html&strategy=skip',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-password', 'Content-Type': 'text/html' },
        body: htmlFixture,
      },
    );

    const secondResponse = await exports.default.fetch(
      'https://example.com/api/transfer/import?format=html&strategy=skip',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-password', 'Content-Type': 'text/html' },
        body: htmlFixture,
      },
    );
    expect(secondResponse.status).toBe(200);
    const summary = (await secondResponse.json()) as {
      categoriesCreated: number;
      categoriesReused: number;
      bookmarksCreated: number;
      bookmarksSkipped: number;
    };
    expect(summary.categoriesCreated).toBe(0);
    expect(summary.categoriesReused).toBeGreaterThanOrEqual(3);
    expect(summary.bookmarksCreated).toBe(0);
    expect(summary.bookmarksSkipped).toBe(5);
  });

  it('round-trips json export through import with strategy=update', async () => {
    const exportResponse = await exports.default.fetch(
      'https://example.com/api/transfer/export?format=json',
      {
        headers: { Authorization: 'Bearer dev-password' },
      },
    );
    const exportedJson = await exportResponse.text();

    const importResponse = await exports.default.fetch(
      'https://example.com/api/transfer/import?format=json&strategy=update',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' },
        body: exportedJson,
      },
    );
    expect(importResponse.status).toBe(200);
    const summary = (await importResponse.json()) as {
      categoriesReused: number;
      bookmarksUpdated: number;
      bookmarksCreated: number;
    };
    expect(summary.categoriesReused).toBeGreaterThan(0);
    expect(summary.bookmarksUpdated).toBeGreaterThan(0);
    expect(summary.bookmarksCreated).toBe(0);
  });

  it('rejects malformed json import with 400', async () => {
    const response = await exports.default.fetch(
      'https://example.com/api/transfer/import?format=json',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' },
        body: '{ not valid json',
      },
    );
    expect(response.status).toBe(400);
  });

  it('auto-detects html when format=auto', async () => {
    const response = await exports.default.fetch(
      'https://example.com/api/transfer/import?format=auto&strategy=skip',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-password', 'Content-Type': 'text/html' },
        body: htmlFixture,
      },
    );
    expect(response.status).toBe(200);
    const summary = (await response.json()) as {
      bookmarksCreated: number;
      bookmarksSkipped: number;
    };
    expect(summary.bookmarksCreated + summary.bookmarksSkipped).toBeGreaterThan(0);
  });

  it('auto-detects json when format=auto', async () => {
    const exportResponse = await exports.default.fetch(
      'https://example.com/api/transfer/export?format=json',
      {
        headers: { Authorization: 'Bearer dev-password' },
      },
    );
    const exportedJson = await exportResponse.text();

    const response = await exports.default.fetch(
      'https://example.com/api/transfer/import?format=auto&strategy=skip',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' },
        body: exportedJson,
      },
    );
    expect(response.status).toBe(200);
  });

  it('returns a friendly chinese message on malformed json', async () => {
    const response = await exports.default.fetch(
      'https://example.com/api/transfer/import?format=json',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' },
        body: '{ not valid json',
      },
    );
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/JSON 格式有误|格式/);
  });
});

describe('parseJson tolerant normalizer', () => {
  it('accepts nav-native shape with exportedAt', () => {
    const data = parseJson(
      JSON.stringify({
        exportedAt: '2024-01-01T00:00:00.000Z',
        categories: [
          {
            name: 'Tools',
            children: [],
            bookmarks: [{ title: 'G', url: 'https://g.example.com' }],
          },
        ],
      }),
    );
    expect(data.categories[0].name).toBe('Tools');
    expect(data.categories[0].bookmarks[0].url).toBe('https://g.example.com');
  });

  it('tolerates missing exportedAt', () => {
    const data = parseJson(JSON.stringify({ categories: [{ name: 'Tools', bookmarks: [] }] }));
    expect(data.exportedAt).toBeTruthy();
    expect(data.categories[0].name).toBe('Tools');
  });

  it('accepts a bare array of categories', () => {
    const data = parseJson(
      JSON.stringify([
        { name: 'A', bookmarks: [] },
        { name: 'B', bookmarks: [] },
      ]),
    );
    expect(data.categories).toHaveLength(2);
    expect(data.categories[1].name).toBe('B');
  });

  it('wraps a flat bookmarks array under an uncategorized bucket', () => {
    const data = parseJson(
      JSON.stringify({ bookmarks: [{ title: 'X', url: 'https://x.example.com' }] }),
    );
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].name).toBe('未分类书签');
    expect(data.categories[0].bookmarks[0].url).toBe('https://x.example.com');
  });

  it('defaults missing children/bookmarks to empty arrays', () => {
    const data = parseJson(JSON.stringify({ categories: [{ name: 'Lonely' }] }));
    expect(data.categories[0].children).toEqual([]);
    expect(data.categories[0].bookmarks).toEqual([]);
  });

  it('normalizes urls without protocol by prepending https://', () => {
    const data = parseJson(
      JSON.stringify({
        categories: [{ name: 'C', bookmarks: [{ title: 'N', url: 'n.example.com' }] }],
      }),
    );
    expect(data.categories[0].bookmarks[0].url).toBe('https://n.example.com');
  });

  it('falls back to unnamed category/bookmark when name/title missing', () => {
    const data = parseJson(
      JSON.stringify({ categories: [{ bookmarks: [{ url: 'https://u.example.com' }] }] }),
    );
    expect(data.categories[0].name).toBe('未命名分类');
    expect(data.categories[0].bookmarks[0].title).toBe('未命名书签');
  });

  it('ignores extra unknown fields', () => {
    const data = parseJson(
      JSON.stringify({
        exportedAt: '2024-01-01T00:00:00.000Z',
        categories: [{ name: 'C', children: [], bookmarks: [], surprise: true }],
        unknownTop: 1,
      }),
    );
    expect(data.categories[0].name).toBe('C');
  });

  it('throws a friendly message when no recognizable data', () => {
    expect(() => parseJson(JSON.stringify({ hello: 'world' }))).toThrow(/未找到|无|没有/);
  });
});

describe('detectFormat', () => {
  it('detects json content', () => {
    expect(detectFormat('x.json', JSON.stringify({ categories: [] }))).toBe('json');
  });

  it('detects html content by doctype', () => {
    expect(detectFormat('bookmarks.html', '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>')).toBe(
      'html',
    );
  });

  it('detects html by dl/h3 markers without doctype', () => {
    expect(detectFormat('export.htm', '<DL><p>\n<DT><H3>书签</H3>\n</DL><p>')).toBe('html');
  });

  it('uses filename extension as a hint for json', () => {
    expect(detectFormat('backup.JSON', '{"categories":[]}')).toBe('json');
  });

  it('throws for unrecognized content', () => {
    expect(() => detectFormat('file.txt', 'just some plain text')).toThrow(/无法识别|格式/);
  });
});
