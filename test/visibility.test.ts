import type { Bookmark, BookmarkPage, Category, Tag } from '../src/shared/api/types';
import type { TransferData } from '../src/worker/transfer/types';

import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

const base = 'https://example.com/api/v1';
const admin = { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' };
const request = (path: string, init?: RequestInit) => exports.default.fetch(`${base}${path}`, init);
const write = (path: string, body: unknown, method = 'POST') =>
  request(path, { method, headers: admin, body: JSON.stringify(body) });
async function category(name: string, extra: Record<string, unknown> = {}) {
  const response = await write('/categories', { name, ...extra });
  expect(response.status).toBe(201);
  return response.json<Category>();
}
async function bookmark(name: string, extra: Record<string, unknown> = {}) {
  const response = await write('/bookmarks', {
    title: `Matrix ${name}`,
    url: `https://${name}.example.com`,
    ...extra,
  });
  expect(response.status).toBe(201);
  return response.json<Bookmark>();
}
async function page(path = '/bookmarks?offset=0', headers?: HeadersInit) {
  const response = await request(path, { headers });
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  return response.json<BookmarkPage>();
}

async function fixture() {
  const open = await category('Open');
  const hidden = await category('Hidden', { visibility: 'private', parentId: open.id });
  const child = await category('Child', { parentId: hidden.id });
  const grandchild = await category('Grandchild', { parentId: child.id });
  const visible = await bookmark('visible', {
    categoryId: open.id,
    tags: ['Shared'],
    isPinned: true,
  });
  const loose = await bookmark('loose', { isPinned: true });
  const ownPrivate = await bookmark('own-private', {
    categoryId: open.id,
    visibility: 'private',
    tags: ['Shared', 'Secret'],
  });
  const inherited = await bookmark('inherited', {
    categoryId: grandchild.id,
    tags: ['Secret'],
    isPinned: true,
  });
  const archived = await bookmark('archived', { tags: ['ArchiveOnly'] });
  await write(`/bookmarks/${archived.id}/archive`, {});
  const trash = await bookmark('trash', { tags: ['TrashOnly'] });
  await request(`/bookmarks/${trash.id}`, { method: 'DELETE', headers: admin });
  await write('/tags', { name: 'Empty' });
  return {
    open,
    hidden,
    child,
    grandchild,
    visible,
    loose,
    ownPrivate,
    inherited,
    archived,
    trash,
  };
}

describe('mixed visibility', () => {
  beforeEach(async () => {
    await env.DB.batch(
      ['bookmark_tags', 'bookmarks', 'categories', 'tags', 'settings'].map((table) =>
        env.DB.prepare(`DELETE FROM ${table}`),
      ),
    );
  });
  it('filters lists, search, both pagination modes and private details in SQL', async () => {
    const f = await fixture();
    for (const path of ['/bookmarks?offset=0', '/bookmarks/search?q=Matrix&offset=0']) {
      const result = await page(path);
      expect(result.total).toBe(2);
      expect(result.items.map((item) => item.id).sort()).toEqual([f.visible.id, f.loose.id].sort());
    }
    for (const path of ['/bookmarks?', '/bookmarks/search?q=Matrix&']) {
      const first = await page(`${path}limit=1`);
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toBeTruthy();
      const second = await page(`${path}limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`);
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(first.items[0].id).not.toBe(second.items[0].id);
    }
    for (const id of [f.ownPrivate.id, f.inherited.id, f.archived.id, f.trash.id, 99999]) {
      const response = await request(`/bookmarks/${id}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: 'not_found', message: 'Bookmark not found' },
      });
    }
    expect((await request(`/bookmarks/${f.visible.id}`)).status).toBe(200);
  });

  it('filters category trees, direct counts and tags including the legacy alias', async () => {
    const f = await fixture();
    const categories = await (await request('/categories')).json<Category[]>();
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({
      id: f.open.id,
      bookmarkCount: 1,
      effectiveVisibility: 'public',
    });
    for (const endpoint of ['/tags', '/bookmarks/tags']) {
      const tags = await (await request(endpoint)).json<Tag[]>();
      expect(tags.map((tag) => [tag.name, tag.bookmarkCount])).toEqual([['Shared', 1]]);
    }
    for (const [filter, expected] of [
      ['category=open', [f.visible.id]],
      ['category=hidden', []],
      ['category=child', []],
      ['category=uncategorized', [f.loose.id]],
      ['untagged=true', [f.loose.id]],
      ['tag=secret', []],
      ['tag=shared', [f.visible.id]],
      ['pinned=true', [f.loose.id, f.visible.id]],
    ] as const) {
      for (const prefix of ['/bookmarks?', '/bookmarks/search?q=Matrix&']) {
        const result = await page(`${prefix}${filter}&offset=0`);
        expect(result.items.map((item) => item.id).sort()).toEqual([...expected].sort());
        expect(result.total).toBe(expected.length);
      }
    }
  });

  it('allows Cookie and Bearer administrators to read private and inactive records', async () => {
    const f = await fixture();
    const login = await write('/auth/login', { password: 'dev-password' });
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0];
    for (const headers of [admin, { Cookie: cookie }]) {
      expect((await page('/bookmarks?view=all&offset=0', headers)).total).toBe(6);
      const response = await request(`/bookmarks/${f.inherited.id}`, { headers });
      expect(await response.json()).toMatchObject({
        visibility: 'public',
        effectiveVisibility: 'private',
      });
      expect((await request(`/bookmarks/${f.trash.id}`, { headers })).status).toBe(200);
    }
    expect((await page('/bookmarks?offset=0', { Cookie: 'nav_session=expired' })).total).toBe(2);
    expect(
      (await request('/bookmarks', { headers: { Authorization: 'Bearer invalid' } })).status,
    ).toBe(401);
  });

  it('keeps management and non-active views authenticated and public settings minimal', async () => {
    for (const path of [
      '/admin/stats',
      '/settings',
      '/transfer/export?format=json',
      '/bookmarks/metadata?url=https://example.com',
      '/bookmarks/favicon?url=https://example.com',
      '/auth/me',
    ]) {
      expect((await request(path)).status).toBe(401);
    }
    for (const view of ['all', 'archive', 'trash']) {
      for (const prefix of ['/bookmarks?', '/bookmarks/search?q=Matrix&']) {
        expect((await request(`${prefix}view=${view}`)).status).toBe(401);
      }
    }
    for (const [path, method] of [
      ['/bookmarks', 'POST'],
      ['/bookmarks/1', 'PUT'],
      ['/bookmarks/1', 'DELETE'],
      ['/bookmarks/1/archive', 'POST'],
      ['/bookmarks/1/restore', 'POST'],
      ['/bookmarks/1/permanent', 'DELETE'],
      ['/categories', 'POST'],
      ['/categories/1', 'PUT'],
      ['/categories/1', 'DELETE'],
      ['/categories/reorder', 'POST'],
      ['/tags', 'POST'],
      ['/tags/1', 'PUT'],
      ['/tags/1', 'DELETE'],
      ['/tags/1/merge', 'POST'],
      ['/settings', 'PUT'],
      ['/transfer/import?format=json', 'POST'],
    ])
      expect((await request(path, { method })).status).toBe(401);
    const config = await request('/settings/public');
    expect(config.status).toBe(200);
    expect(Object.keys(await config.json()).sort()).toEqual([
      'backgroundImageEnabled',
      'backgroundImageUrl',
      'defaultEngineId',
      'searchEngines',
    ]);
  });

  it('honors creation defaults and retains explicit privacy through unrelated updates', async () => {
    const old = await bookmark('old');
    expect(old.visibility).toBe('public');
    await write(
      '/settings',
      { defaultCategoryVisibility: 'private', defaultBookmarkVisibility: 'private' },
      'PUT',
    );
    expect((await category('Default')).visibility).toBe('private');
    const created = await bookmark('default');
    expect(created.visibility).toBe('private');
    expect((await bookmark('override', { visibility: 'public' })).visibility).toBe('public');
    const updated = await write(`/bookmarks/${created.id}`, { title: 'Renamed' }, 'PUT');
    expect(await updated.json()).toMatchObject({ visibility: 'private' });
    expect((await request(`/bookmarks/${old.id}`)).status).toBe(200);
    expect((await write('/settings', { defaultCategoryVisibility: 'invalid' }, 'PUT')).status).toBe(
      400,
    );
    expect((await write('/categories', { name: 'Invalid', visibility: 'invalid' })).status).toBe(
      400,
    );
    expect((await write(`/bookmarks/${old.id}`, { visibility: 'invalid' }, 'PUT')).status).toBe(
      400,
    );
  });

  it('recalculates inherited privacy on moving and never rewrites descendant explicit settings', async () => {
    const hidden = await category('Private', { visibility: 'private' });
    const child = await category('Child', { parentId: hidden.id });
    const inherited = await bookmark('inherited', { categoryId: child.id });
    const explicit = await bookmark('explicit', { categoryId: child.id, visibility: 'private' });
    await write(`/categories/${hidden.id}`, { visibility: 'public' }, 'PUT');
    expect((await request(`/bookmarks/${inherited.id}`)).status).toBe(200);
    expect((await request(`/bookmarks/${explicit.id}`)).status).toBe(404);
    await write(`/categories/${hidden.id}`, { visibility: 'private' }, 'PUT');
    expect((await request(`/bookmarks/${inherited.id}`)).status).toBe(404);
    await write(`/categories/${child.id}`, { parentId: null }, 'PUT');
    expect((await request(`/bookmarks/${inherited.id}`)).status).toBe(200);
    await write(`/bookmarks/${inherited.id}`, { categoryId: hidden.id }, 'PUT');
    expect((await request(`/bookmarks/${inherited.id}`)).status).toBe(404);
  });

  it('preserves inherited privacy when deleting a category', async () => {
    const hidden = await category('Private', { visibility: 'private' });
    const child = await category('Child', { parentId: hidden.id });
    const direct = await bookmark('direct', { categoryId: hidden.id });
    const nested = await bookmark('nested', { categoryId: child.id });
    expect(
      (await request(`/categories/${hidden.id}`, { method: 'DELETE', headers: admin })).status,
    ).toBe(204);
    const cats = await (await request('/categories', { headers: admin })).json<Category[]>();
    expect(cats.find((item) => item.id === child.id)).toMatchObject({
      parentId: null,
      visibility: 'private',
    });
    expect(
      await (await request(`/bookmarks/${direct.id}`, { headers: admin })).json(),
    ).toMatchObject({ categoryId: null, visibility: 'private' });
    expect((await request(`/bookmarks/${nested.id}`)).status).toBe(404);
    expect((await request(`/bookmarks/${direct.id}`)).status).toBe(404);
  });

  it('exports and restores v2 explicit permissions and privately imports legacy data', async () => {
    const hidden = await category('Secret', { visibility: 'private' });
    await bookmark('private-child', { categoryId: hidden.id });
    await bookmark('public');
    const exported = await (
      await request('/transfer/export?format=json', { headers: admin })
    ).json<TransferData>();
    expect(exported.version).toBe(2);
    expect(exported.categories?.[0].visibility).toBe('private');
    expect(
      exported.bookmarks.find((item) => item.title === 'Matrix private-child')?.visibility,
    ).toBe('public');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM bookmark_tags'),
      env.DB.prepare('DELETE FROM bookmarks'),
      env.DB.prepare('DELETE FROM categories'),
    ]);
    expect((await write('/transfer/import?format=json', exported)).status).toBe(200);
    expect((await page()).items.map((item) => item.title)).toEqual(['Matrix public']);
    const legacy = {
      version: 1,
      bookmarks: [{ title: 'Legacy', url: 'https://legacy.example.com', categorySlug: 'legacy' }],
      categories: [{ name: 'Legacy', slug: 'legacy' }],
    };
    expect((await write('/transfer/import?format=json', legacy)).status).toBe(200);
    const all = await page('/bookmarks?view=all&offset=0', admin);
    expect(all.items.find((item) => item.title === 'Legacy')?.visibility).toBe('private');
    expect((await page()).total).toBe(1);
  });

  it('preserves existing permissions on old imports and rejects invalid permissions', async () => {
    const hidden = await category('Hidden', { visibility: 'private' });
    const b = await bookmark('existing', { categoryId: hidden.id });
    const legacy = {
      version: 1,
      categories: [{ name: 'Hidden', slug: hidden.slug }],
      bookmarks: [{ title: 'Updated', url: b.url }],
    };
    expect((await write('/transfer/import?format=json&strategy=update', legacy)).status).toBe(200);
    expect((await request(`/bookmarks/${b.id}`)).status).toBe(404);
    expect(await (await request(`/bookmarks/${b.id}`, { headers: admin })).json()).toMatchObject({
      categoryId: null,
      visibility: 'private',
    });
    expect(
      (
        await write('/transfer/import?format=json', {
          version: 2,
          bookmarks: [{ url: 'https://invalid.example.com', visibility: 'invalid' }],
        })
      ).status,
    ).toBe(400);
  });

  it('keeps HTML imports private and rejects broken v2 hierarchy', async () => {
    const imported = await request('/transfer/import?format=html', {
      method: 'POST',
      headers: admin,
      body: `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
<DT><H3>Imported</H3>
<DL><p>
<DT><A HREF="https://html.example.com">HTML</A>
</DL><p>
</DL><p>`,
    });
    expect(imported.status).toBe(200);
    expect((await page()).total).toBe(0);
    const all = await page('/bookmarks?view=all&offset=0', admin);
    expect(all.items[0].visibility).toBe('private');
    for (const data of [
      {
        version: 2,
        categories: [
          { name: 'Broken', slug: 'broken', parentSlug: 'missing', visibility: 'public' },
        ],
        bookmarks: [],
      },
      {
        version: 2,
        bookmarks: [
          {
            title: 'Broken',
            url: 'https://broken.example.com',
            categorySlug: 'missing',
            visibility: 'public',
          },
        ],
      },
      {
        version: 2,
        categories: [{ name: 'Cycle', slug: 'cycle', parentSlug: 'cycle' }],
        bookmarks: [],
      },
    ])
      expect((await write('/transfer/import?format=json', data)).status).toBe(400);
    expect((await page()).total).toBe(0);
  });

  it('migrates existing rows to private without changing their data', async () => {
    await env.DB.prepare('ALTER TABLE bookmarks DROP COLUMN visibility').run();
    await env.DB.prepare('ALTER TABLE categories DROP COLUMN visibility').run();
    await env.DB.prepare("INSERT INTO categories (name, slug) VALUES ('Old', 'old')").run();
    await env.DB.prepare(
      "INSERT INTO bookmarks (title, url, url_normalized) VALUES ('Old', 'https://old.example.com', 'https://old.example.com')",
    ).run();
    const migration = env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0002'))!;
    await env.DB.batch(migration.queries.map((query) => env.DB.prepare(query)));
    expect(await env.DB.prepare('SELECT visibility FROM categories').first('visibility')).toBe(
      'private',
    );
    expect(await env.DB.prepare('SELECT visibility FROM bookmarks').first('visibility')).toBe(
      'private',
    );
    expect((await page()).total).toBe(0);
  });
});
