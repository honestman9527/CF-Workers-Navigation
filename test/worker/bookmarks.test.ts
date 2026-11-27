import type { Bookmark, BookmarkPage, Tag } from '../../src/shared/api/types';

import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const API = 'https://example.com/api/v1';
const adminHeaders = { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' };

async function createBookmark(input: Record<string, unknown>): Promise<Bookmark> {
  const response = await exports.default.fetch(`${API}/bookmarks`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return response.json<Bookmark>();
}

async function listBookmarks(query = ''): Promise<{ response: Response; page: BookmarkPage }> {
  const response = await exports.default.fetch(`${API}/bookmarks${query}`, {
    headers: adminHeaders,
  });
  return { response, page: await response.json<BookmarkPage>() };
}

async function searchBookmarks(query: string, options: Record<string, string> = {}) {
  const endpoint = new URL(`${API}/bookmarks/search`);
  endpoint.searchParams.set('q', query);
  for (const [key, value] of Object.entries(options)) endpoint.searchParams.set(key, value);
  const response = await exports.default.fetch(endpoint, { headers: adminHeaders });
  return { response, page: response.ok ? await response.json<BookmarkPage>() : null };
}

describe('bookmarks api', () => {
  it('creates, reads, updates, and soft-deletes a tagged bookmark', async () => {
    const created = await createBookmark({
      title: 'Cloudflare',
      url: 'https://www.cloudflare.com/',
      tags: ['Infra', 'Docs', 'infra'],
    });

    expect(created).toMatchObject({
      title: 'Cloudflare',
      tags: ['Infra', 'Docs'],
      categoryId: null,
      categorySlug: null,
      categoryName: null,
      archivedAt: null,
      deletedAt: null,
    });
    expect(created.sortOrder).toEqual(expect.any(Number));
    expect(created.sortOrder).toBeGreaterThanOrEqual(0);

    const detail = await exports.default.fetch(`${API}/bookmarks/${created.id}`, {
      headers: adminHeaders,
    });
    expect(detail.status).toBe(200);

    const updated = await exports.default.fetch(`${API}/bookmarks/${created.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'Cloudflare Docs', tags: ['Platform'] }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ title: 'Cloudflare Docs', tags: ['Platform'] });

    const deleted = await exports.default.fetch(`${API}/bookmarks/${created.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    expect(deleted.status).toBe(204);

    const active = await listBookmarks();
    expect(active.page.items.map((bookmark) => bookmark.id)).not.toContain(created.id);
    const trash = await listBookmarks('?view=trash');
    expect(trash.page.items.map((bookmark) => bookmark.id)).toContain(created.id);
  });

  it('fills a favicon when iconUrl is omitted', async () => {
    const bookmark = await createBookmark({
      title: 'Automatic icon',
      url: 'https://automatic-icon.example.com/path',
    });

    expect(bookmark.iconUrl).toBe(
      'https://www.google.com/s2/favicons?domain=automatic-icon.example.com&sz=64',
    );
  });

  it('allows public reads but requires auth for writes', async () => {
    const created = await createBookmark({
      title: 'Protected',
      url: 'https://protected.example.com',
    });
    const responses = await Promise.all([
      exports.default.fetch(`${API}/bookmarks`),
      exports.default.fetch(`${API}/bookmarks/${created.id}`),
      exports.default.fetch(`${API}/bookmarks/search?q=protected`),
      exports.default.fetch(`${API}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Nope', url: 'https://nope.example.com' }),
      }),
      exports.default.fetch(`${API}/bookmarks/${created.id}`, {
        method: 'DELETE',
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 401, 401]);
  });

  it('validates malformed input and query parameters', async () => {
    const malformed = await exports.default.fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: adminHeaders,
      body: '{',
    });
    expect(malformed.status).toBe(400);

    const invalidIcon = await exports.default.fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Invalid Icon',
        url: 'https://invalid-icon.example.com',
        iconUrl: 'not-a-url',
      }),
    });
    expect(invalidIcon.status).toBe(400);

    const invalidLimit = await exports.default.fetch(`${API}/bookmarks?limit=101`, {
      headers: adminHeaders,
    });
    expect(invalidLimit.status).toBe(400);
  });

  it('rejects duplicate active URLs within the same category or uncategorized while allowing cross-category copies', async () => {
    const catResp = await exports.default.fetch(`${API}/categories`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'ScopeCatA' }),
    });
    const catA = await catResp.json<{ id: number }>();
    const catBResp = await exports.default.fetch(`${API}/categories`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'ScopeCatB' }),
    });
    const catB = await catBResp.json<{ id: number }>();

    // 未分类内部去重
    const uncat = await createBookmark({
      title: 'Uncat First',
      url: 'https://duplicate.example.com/path/',
      tags: ['UncatTag'],
    });
    const uncatDup = await exports.default.fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Uncat Second',
        url: 'https://DUPLICATE.example.com/path#section',
      }),
    });
    expect(uncatDup.status).toBe(409);

    // 不同分类允许相同 URL 且标签写入互不干扰
    const inA = await createBookmark({
      title: 'In Cat A',
      url: 'https://DUPLICATE.example.com/path#a',
      categoryId: catA.id,
      tags: ['TagA'],
    });
    const inB = await createBookmark({
      title: 'In Cat B',
      url: 'https://duplicate.example.com/path',
      categoryId: catB.id,
      tags: ['TagB'],
    });
    expect(inA.tags).toEqual(['TagA']);
    expect(inB.tags).toEqual(['TagB']);
    expect((await listBookmarks(`/${uncat.id}`.replace('/', '?limit=100'))).page).toBeDefined();
    const uncatReloaded = await (
      await exports.default.fetch(`${API}/bookmarks/${uncat.id}`, { headers: adminHeaders })
    ).json<Bookmark>();
    const inAReloaded = await (
      await exports.default.fetch(`${API}/bookmarks/${inA.id}`, { headers: adminHeaders })
    ).json<Bookmark>();
    expect(uncatReloaded.tags).toEqual(['UncatTag']);
    expect(inAReloaded.tags).toEqual(['TagA']);

    // 同分类内新建冲突
    const inADup = await exports.default.fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'In Cat A Dup',
        url: 'https://duplicate.example.com/path/',
        categoryId: catA.id,
      }),
    });
    expect(inADup.status).toBe(409);

    // 编辑切换分类冲突，以及编辑修改 URL 冲突
    const moveConflict = await exports.default.fetch(`${API}/bookmarks/${inB.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ categoryId: catA.id }),
    });
    expect(moveConflict.status).toBe(409);

    const otherInA = await createBookmark({
      title: 'Other In A',
      url: 'https://other-in-a.example.com',
      categoryId: catA.id,
    });
    const urlUpdateConflict = await exports.default.fetch(`${API}/bookmarks/${otherInA.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://duplicate.example.com/path' }),
    });
    expect(urlUpdateConflict.status).toBe(409);

    // 站内搜索原样返回各分类副本
    const search = await searchBookmarks('duplicate.example.com');
    const searchIds = search.page?.items.map((item) => item.id) ?? [];
    expect(searchIds).toEqual(expect.arrayContaining([uncat.id, inA.id, inB.id]));
  });

  it('copies a bookmark to another category or uncategorized, prevents duplicates, and preserves inherited privacy', async () => {
    const publicTarget = await (
      await exports.default.fetch(`${API}/categories`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ name: 'CopyPublicTarget', visibility: 'public' }),
      })
    ).json<{ id: number; slug: string }>();
    const privateSourceCat = await (
      await exports.default.fetch(`${API}/categories`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ name: 'CopyPrivateSource', visibility: 'private' }),
      })
    ).json<{ id: number }>();

    const source = await createBookmark({
      title: 'Copy Source',
      url: 'https://copy-source.example.com',
      description: 'Desc',
      categoryId: privateSourceCat.id,
      visibility: 'public',
      tags: ['CopyTag1', 'CopyTag2'],
    });
    expect(source.effectiveVisibility).toBe('private');

    // 未登录禁止复制
    const unauthed = await exports.default.fetch(`${API}/bookmarks/${source.id}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: publicTarget.id }),
    });
    expect(unauthed.status).toBe(401);

    // 复制到公开分类时自动固化 visibility='private' 并保留标签与末尾 sortOrder
    await createBookmark({
      title: 'Existing In Target',
      url: 'https://existing-target.example.com',
      categoryId: publicTarget.id,
    });
    const copied = await exports.default.fetch(`${API}/bookmarks/${source.id}/copy`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ categoryId: publicTarget.id }),
    });
    expect(copied.status).toBe(201);
    const copiedDto = await copied.json<Bookmark>();
    expect(copiedDto).toMatchObject({
      title: 'Copy Source',
      url: 'https://copy-source.example.com',
      description: 'Desc',
      categoryId: publicTarget.id,
      visibility: 'private',
      effectiveVisibility: 'private',
      sortOrder: 1,
    });
    expect(copiedDto.tags.toSorted()).toEqual(['CopyTag1', 'CopyTag2']);

    // 同一目标再次复制冲突 409；复制到自身所属分类 400
    expect(
      (
        await exports.default.fetch(`${API}/bookmarks/${source.id}/copy`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ categoryId: publicTarget.id }),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await exports.default.fetch(`${API}/bookmarks/${source.id}/copy`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ categoryId: privateSourceCat.id }),
        })
      ).status,
    ).toBe(400);

    // 复制到未分类成功
    const copiedUncat = await exports.default.fetch(`${API}/bookmarks/${source.id}/copy`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ categoryId: null }),
    });
    expect(copiedUncat.status).toBe(201);
    expect(await copiedUncat.json<Bookmark>()).toMatchObject({
      categoryId: null,
      visibility: 'private',
    });

    // 目标分类或源书签不存在 → 404
    expect(
      (
        await exports.default.fetch(`${API}/bookmarks/${source.id}/copy`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ categoryId: 999999 }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await exports.default.fetch(`${API}/bookmarks/999999/copy`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ categoryId: null }),
        })
      ).status,
    ).toBe(404);

    // 归档或回收站书签不可复制 → 400
    await exports.default.fetch(`${API}/bookmarks/${copiedDto.id}/archive`, {
      method: 'POST',
      headers: adminHeaders,
    });
    expect(
      (
        await exports.default.fetch(`${API}/bookmarks/${copiedDto.id}/copy`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ categoryId: null }),
        })
      ).status,
    ).toBe(400);
  });

  it('allows replacing a deleted URL and reports a conflict when restoring the old record', async () => {
    const old = await createBookmark({ title: 'Old', url: 'https://restore-conflict.example.com' });
    await exports.default.fetch(`${API}/bookmarks/${old.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    const replacement = await createBookmark({
      title: 'Replacement',
      url: 'https://restore-conflict.example.com',
    });
    expect(replacement.id).not.toBe(old.id);

    const restore = await exports.default.fetch(`${API}/bookmarks/${old.id}/restore`, {
      method: 'POST',
      headers: adminHeaders,
    });
    expect(restore.status).toBe(409);
  });
});

describe('bookmark pagination and filters', () => {
  it('paginates with an opaque cursor without duplicates', async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createBookmark({
          title: `Cursor ${index}`,
          url: `https://cursor-${index}.example.com`,
          tags: ['CursorPagination'],
        }),
      ),
    );

    const first = await listBookmarks('?limit=2&tag=cursorpagination');
    expect(first.response.status).toBe(200);
    expect(first.page.items).toHaveLength(2);
    expect(first.page.nextCursor).toEqual(expect.any(String));

    const second = await listBookmarks(
      `?limit=2&tag=cursorpagination&cursor=${encodeURIComponent(first.page.nextCursor!)}`,
    );
    expect(second.page.items).toHaveLength(2);
    const third = await listBookmarks(
      `?limit=2&tag=cursorpagination&cursor=${encodeURIComponent(second.page.nextCursor!)}`,
    );
    expect(third.page.items).toHaveLength(1);
    expect(third.page.nextCursor).toBeNull();

    const ids = [...first.page.items, ...second.page.items, ...third.page.items].map(
      ({ id }) => id,
    );
    expect(new Set(ids).size).toBe(5);
    expect(ids.sort()).toEqual(created.map(({ id }) => id).sort());
  });

  it('rejects an invalid cursor', async () => {
    const response = await exports.default.fetch(`${API}/bookmarks?cursor=invalid`, {
      headers: adminHeaders,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it.each([null, [], 1, 'cursor', {}, { id: -1, rank: 0, createdAt: '2026-10-01' }])(
    'rejects a decodable invalid cursor %j for lists and search',
    async (value) => {
      const cursor = btoa(JSON.stringify(value))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');
      for (const path of [
        `bookmarks?cursor=${cursor}`,
        `bookmarks/search?q=example&cursor=${cursor}`,
      ]) {
        const response = await exports.default.fetch(`${API}/${path}`, { headers: adminHeaders });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
      }
    },
  );

  it('paginates with offset + total without duplicates', async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createBookmark({
          title: `Offset ${index}`,
          url: `https://offset-${index}.example.com`,
          tags: ['OffsetPagination'],
        }),
      ),
    );

    const first = await listBookmarks('?limit=2&offset=0&tag=offsetpagination');
    expect(first.response.status).toBe(200);
    expect(first.page.items).toHaveLength(2);
    expect(first.page.total).toBe(5);
    expect(first.page.nextCursor).toBeNull();

    const second = await listBookmarks('?limit=2&offset=2&tag=offsetpagination');
    expect(second.page.items).toHaveLength(2);
    expect(second.page.total).toBe(5);

    const third = await listBookmarks('?limit=2&offset=4&tag=offsetpagination');
    expect(third.page.items).toHaveLength(1);
    expect(third.page.total).toBe(5);

    const ids = [...first.page.items, ...second.page.items, ...third.page.items].map(
      ({ id }) => id,
    );
    expect(new Set(ids).size).toBe(5);
    expect(ids.sort()).toEqual(created.map(({ id }) => id).sort());

    // 超出范围的 offset：空页但总数不变。
    const empty = await listBookmarks('?limit=2&offset=99&tag=offsetpagination');
    expect(empty.page.items).toEqual([]);
    expect(empty.page.total).toBe(5);
    expect(empty.page.nextCursor).toBeNull();
  });

  it('ignores offset in cursor mode absent an offset parameter', async () => {
    await createBookmark({
      title: 'No offset mode',
      url: 'https://no-offset.example.com',
      tags: ['OffsetMark'],
    });
    const page = await listBookmarks('?tag=offsetmark&limit=10');
    expect(page.page.items).toHaveLength(1);
    // 未携带 offset 时不返回 total，保持游标契约。
    expect(page.page.total).toBeUndefined();
  });

  it('combines tag and status filters', async () => {
    const active = await createBookmark({
      title: 'Active React',
      url: 'https://active-react.example.com',
      tags: ['React'],
    });
    const archived = await createBookmark({
      title: 'Archived React',
      url: 'https://archived-react.example.com',
      tags: ['React'],
    });
    await exports.default.fetch(`${API}/bookmarks/${archived.id}/archive`, {
      method: 'POST',
      headers: adminHeaders,
    });

    const filtered = await listBookmarks('?tag=react');
    expect(filtered.page.items.map(({ id }) => id)).toEqual([active.id]);
    const archive = await listBookmarks('?view=archive&tag=react');
    expect(archive.page.items.map(({ id }) => id)).toContain(archived.id);
  });

  it('lists tags with active bookmark counts', async () => {
    const active = await createBookmark({
      title: 'Tagged active',
      url: 'https://tag-active.example.com',
      tags: ['Testing'],
    });
    const archived = await createBookmark({
      title: 'Tagged archived',
      url: 'https://tag-archived.example.com',
      tags: ['Testing'],
    });
    await exports.default.fetch(`${API}/bookmarks/${archived.id}/archive`, {
      method: 'POST',
      headers: adminHeaders,
    });

    const response = await exports.default.fetch(`${API}/tags`, {
      headers: adminHeaders,
    });
    expect(response.status).toBe(200);
    const tags = await response.json<Tag[]>();
    expect(tags.find((tag) => tag.slug === 'testing')?.bookmarkCount).toBe(1);
    expect(active.id).toBeGreaterThan(0);
  });

  it('does not expose the removed bookmarks/tags alias', async () => {
    const response = await exports.default.fetch(`${API}/bookmarks/tags`, {
      headers: adminHeaders,
    });
    expect(response.status).toBe(404);
  });
});

describe('bookmark search', () => {
  it('matches title, URL, and description and refreshes FTS content after updates', async () => {
    const titleMatch = await createBookmark({
      title: 'Cloudflare Workers Docs',
      url: 'https://workers-docs.example.com',
    });
    const urlMatch = await createBookmark({
      title: 'Runtime',
      url: 'https://nodejs.example.com/runtime',
    });
    const descriptionMatch = await createBookmark({
      title: 'Tool',
      url: 'https://description.example.com',
      description: 'Built for nodejs services',
    });

    expect((await searchBookmarks('cloud')).page?.items.map(({ id }) => id)).toContain(
      titleMatch.id,
    );
    const nodeIds = (await searchBookmarks('nodejs')).page?.items.map(({ id }) => id);
    expect(nodeIds).toEqual(expect.arrayContaining([urlMatch.id, descriptionMatch.id]));

    await exports.default.fetch(`${API}/bookmarks/${titleMatch.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'Renamed Platform Guide' }),
    });
    expect((await searchBookmarks('cloud')).page?.items.map(({ id }) => id)).not.toContain(
      titleMatch.id,
    );
    expect((await searchBookmarks('platform')).page?.items.map(({ id }) => id)).toContain(
      titleMatch.id,
    );
  });

  it('supports OR terms, special characters, and empty results', async () => {
    const google = await createBookmark({
      title: 'Google Search',
      url: 'https://google-query.example.com',
    });
    const maps = await createBookmark({
      title: 'Maps Service',
      url: 'https://maps-query.example.com',
    });
    await createBookmark({ title: 'Learn C++ Today', url: 'https://cpp-query.example.com' });

    const ids = (await searchBookmarks('google maps')).page?.items.map(({ id }) => id);
    expect(ids).toEqual(expect.arrayContaining([google.id, maps.id]));
    for (const query of ['C++', '"react', '*', '(test']) {
      expect((await searchBookmarks(query)).response.status).toBe(200);
    }
    expect((await searchBookmarks('zzznoresultzzz')).page).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('paginates search results with a cursor', async () => {
    await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        createBookmark({
          title: `Search Cursor Shared ${index}`,
          url: `https://search-cursor-${index}.example.com`,
        }),
      ),
    );

    const first = await searchBookmarks('shared', { limit: '2' });
    expect(first.page?.items).toHaveLength(2);
    expect(first.page?.nextCursor).toEqual(expect.any(String));
    const second = await searchBookmarks('shared', {
      limit: '2',
      cursor: first.page!.nextCursor!,
    });
    expect(second.page?.items).toHaveLength(1);
    expect(second.page?.nextCursor).toBeNull();
    const ids = [...first.page!.items, ...second.page!.items].map(({ id }) => id);
    expect(new Set(ids).size).toBe(3);
  });

  it('paginates search results with offset + total', async () => {
    await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        createBookmark({
          title: `Search Offset Unique ${index}`,
          url: `https://search-offset-${index}.example.com`,
        }),
      ),
    );

    const first = await searchBookmarks('unique', { limit: '2', offset: '0' });
    expect(first.page?.items).toHaveLength(2);
    expect(first.page?.total).toBe(3);
    expect(first.page?.nextCursor).toBeNull();
    // 搜索分页的总数只统计同一查询。
    const second = await searchBookmarks('unique', { limit: '2', offset: '2' });
    expect(second.page?.items).toHaveLength(1);
    expect(second.page?.total).toBe(3);
    const ids = [...first.page!.items, ...second.page!.items].map(({ id }) => id);
    expect(new Set(ids).size).toBe(3);
  });

  it('applies view and tag filters to search', async () => {
    const activeBm = await createBookmark({
      title: 'Filtered Search Shared',
      url: 'https://filtered-search-active.example.com',
      tags: ['SearchFilter'],
    });
    const archived = await createBookmark({
      title: 'Filtered Search Shared',
      url: 'https://filtered-search-archived.example.com',
      tags: ['SearchFilter'],
    });
    await exports.default.fetch(`${API}/bookmarks/${archived.id}/archive`, {
      method: 'POST',
      headers: adminHeaders,
    });

    const active = await searchBookmarks('filtered', {
      tag: 'searchfilter',
    });
    expect(active.page?.items.map(({ id }) => id)).toEqual([activeBm.id]);
    const archive = await searchBookmarks('filtered', {
      view: 'archive',
      tag: 'searchfilter',
    });
    expect(archive.page?.items.map(({ id }) => id)).toContain(archived.id);
  });
});

describe('untagged bookmark filter', () => {
  it('distinguishes uncategorized and untagged, including a real untagged tag', async () => {
    const categoryResponse = await exports.default.fetch(`${API}/categories`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Empty tag checks' }),
    });
    expect(categoryResponse.status).toBe(201);
    const category = await categoryResponse.json<{ id: number }>();
    const empty = await createBookmark({
      title: 'No labels',
      url: 'https://untagged.test/empty',
      categoryId: category.id,
    });
    const tagged = await createBookmark({
      title: 'With labels',
      url: 'https://untagged.test/tagged',
      tags: ['untagged'],
    });
    const both = await createBookmark({ title: 'Neither', url: 'https://untagged.test/both' });
    const ids = (page: BookmarkPage) => page.items.map((item) => item.id);
    expect(ids((await listBookmarks('?untagged=true')).page)).toEqual(
      expect.arrayContaining([empty.id, both.id]),
    );
    expect(ids((await listBookmarks('?untagged=true')).page)).not.toContain(tagged.id);
    const uncategorized = ids((await listBookmarks('?category=uncategorized&limit=100')).page);
    expect(uncategorized).toContain(tagged.id);
    expect(uncategorized).not.toContain(empty.id);
    expect(ids((await listBookmarks('?tag=untagged')).page)).toContain(tagged.id);
    expect((await listBookmarks('?tag=untagged&untagged=true')).page.items).toEqual([]);
    expect(ids((await listBookmarks('?untagged=false')).page)).toContain(tagged.id);
    const update = await exports.default.fetch(`${API}/bookmarks/${tagged.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ tags: [] }),
    });
    expect(update.status).toBe(200);
    expect(ids((await listBookmarks('?untagged=true')).page)).toContain(tagged.id);
  });

  it('applies the same filter to list/search cursors, totals and lifecycle states', async () => {
    const categoryResponse = await exports.default.fetch(`${API}/categories`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Emptyfilter pagination' }),
    });
    expect(categoryResponse.status).toBe(201);
    const category = await categoryResponse.json<{ id: number; slug: string }>();
    const scopedListBookmarks = (query: string) =>
      listBookmarks(`?category=${category.slug}&${query.slice(1)}`);
    const first = await createBookmark({
      categoryId: category.id,
      title: 'Emptyfilter first',
      url: 'https://emptyfilter.test/first',
    });
    const second = await createBookmark({
      categoryId: category.id,
      title: 'Emptyfilter second',
      url: 'https://emptyfilter.test/second',
    });
    await createBookmark({
      categoryId: category.id,
      title: 'Emptyfilter tagged',
      url: 'https://emptyfilter.test/tagged',
      tags: ['label'],
    });
    const archived = await createBookmark({
      categoryId: category.id,
      title: 'Emptyfilter archive',
      url: 'https://emptyfilter.test/archive',
    });
    const trash = await createBookmark({
      categoryId: category.id,
      title: 'Emptyfilter trash',
      url: 'https://emptyfilter.test/trash',
    });
    expect(
      (
        await exports.default.fetch(`${API}/bookmarks/${archived.id}/archive`, {
          method: 'POST',
          headers: adminHeaders,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await exports.default.fetch(`${API}/bookmarks/${trash.id}`, {
          method: 'DELETE',
          headers: adminHeaders,
        })
      ).status,
    ).toBe(204);

    const list = (await scopedListBookmarks('?untagged=1&limit=1')).page;
    expect(list.items).toHaveLength(1);
    expect(list.nextCursor).toBeTruthy();
    const next = (
      await scopedListBookmarks(
        `?untagged=1&limit=1&cursor=${encodeURIComponent(list.nextCursor!)}`,
      )
    ).page;
    expect(new Set([...list.items, ...next.items].map((item) => item.id))).toEqual(
      new Set([first.id, second.id]),
    );
    const offset = (await scopedListBookmarks('?untagged=true&offset=1&limit=1')).page;
    expect(offset.total).toBe(2);
    expect(offset.items).toHaveLength(1);
    expect(offset.nextCursor).toBeNull();

    const search = (await searchBookmarks('Emptyfilter', { untagged: 'true', limit: '1' })).page!;
    expect(search.nextCursor).toBeTruthy();
    const searchNext = (
      await searchBookmarks('Emptyfilter', {
        untagged: 'true',
        limit: '1',
        cursor: search.nextCursor!,
      })
    ).page!;
    expect(new Set([...search.items, ...searchNext.items].map((item) => item.id))).toEqual(
      new Set([first.id, second.id]),
    );
    const searchOffset = (
      await searchBookmarks('Emptyfilter', { untagged: 'true', offset: '1', limit: '1' })
    ).page!;
    expect(searchOffset.total).toBe(2);
    expect(searchOffset.items).toHaveLength(1);
    expect(searchOffset.nextCursor).toBeNull();
    expect(
      (await searchBookmarks('Emptyfilter', { tag: 'label', untagged: 'true' })).page!.items,
    ).toEqual([]);
    expect(
      (await scopedListBookmarks('?untagged=true&view=archive')).page.items.map((item) => item.id),
    ).toEqual([archived.id]);
    expect(
      (await scopedListBookmarks('?untagged=true&view=trash')).page.items.map((item) => item.id),
    ).toEqual([trash.id]);
    expect(
      (await searchBookmarks('Emptyfilter', { untagged: 'true', view: 'all', offset: '0' })).page!
        .total,
    ).toBe(4);
    expect((await scopedListBookmarks('?untagged=invalid')).response.status).toBe(400);
    expect((await searchBookmarks('Emptyfilter', { untagged: 'invalid' })).response.status).toBe(
      400,
    );
  });
});

describe('direct category bookmark groups', () => {
  it('keeps subtree defaults and separates direct list/search pages with permissions', async () => {
    const createCategory = async (name: string, parentId?: number, visibility = 'public') => {
      const response = await exports.default.fetch(`${API}/categories`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ name, parentId, visibility }),
      });
      expect(response.status).toBe(201);
      return response.json<{ id: number; slug: string }>();
    };
    const root = await createCategory('Flat groups');
    const child = await createCategory('Child group', root.id);
    const direct = await createBookmark({
      title: 'flatgroup direct',
      url: 'https://flat.test/direct',
      categoryId: root.id,
      visibility: 'public',
      tags: ['flatgroup'],
    });
    const nested = await createBookmark({
      title: 'flatgroup child',
      url: 'https://flat.test/child',
      categoryId: child.id,
      visibility: 'public',
      tags: ['flatgroup'],
    });
    await createBookmark({
      title: 'flatgroup private',
      url: 'https://flat.test/private',
      categoryId: root.id,
      visibility: 'private',
    });
    const later = await createBookmark({
      title: 'flatgroup later',
      url: 'https://flat.test/later',
      categoryId: root.id,
      visibility: 'public',
      tags: ['flatgroup'],
    });
    const ids = (page: BookmarkPage) => page.items.map((item) => item.id);
    const all = await listBookmarks(`?category=${root.slug}&tag=flatgroup`);
    expect(ids(all.page)).toEqual(expect.arrayContaining([direct.id, nested.id]));
    const own = await listBookmarks(
      `?category=${root.slug}&categoryOnly=true&tag=flatgroup&offset=0&limit=1`,
    );
    expect(ids(own.page)).toEqual([direct.id]);
    expect(own.page.total).toBe(2);
    const search = await searchBookmarks('flatgroup', {
      category: root.slug,
      categoryOnly: '1',
      tag: 'flatgroup',
    });
    expect(ids(search.page!)).toEqual(expect.arrayContaining([direct.id, later.id]));
    expect(ids(search.page!)).not.toContain(nested.id);
    const response = await exports.default.fetch(
      `${API}/bookmarks?category=${root.slug}&categoryOnly=true&limit=1`,
    );
    expect(response.status).toBe(200);
    const page = await response.json<BookmarkPage>();
    expect(ids(page)).toEqual([direct.id]);
    expect(page.nextCursor).not.toBeNull();
    const nextResponse = await exports.default.fetch(
      `${API}/bookmarks?category=${root.slug}&categoryOnly=true&limit=1&cursor=${encodeURIComponent(page.nextCursor!)}`,
    );
    const nextPage = await nextResponse.json<BookmarkPage>();
    expect(ids(nextPage)).toEqual([later.id]);
    expect(nextPage.nextCursor).toBeNull();
    expect(
      (await listBookmarks('?category=missing-flatgroup&categoryOnly=true')).page.items,
    ).toEqual([]);
    expect((await listBookmarks(`?category=${root.slug}&categoryOnly=bad`)).response.status).toBe(
      400,
    );
    const privateRoot = await createCategory('Hidden flat groups', undefined, 'private');
    await createBookmark({
      title: 'Hidden flatgroup',
      url: 'https://flat.test/inherited',
      categoryId: privateRoot.id,
      visibility: 'public',
    });
    const hidden = await exports.default.fetch(
      `${API}/bookmarks?category=${privateRoot.slug}&categoryOnly=true`,
    );
    expect((await hidden.json<BookmarkPage>()).items).toEqual([]);
  });
});

describe('bookmark sorting and reorder', () => {
  async function createCategory(name: string) {
    const response = await exports.default.fetch(`${API}/categories`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name }),
    });
    expect(response.status).toBe(201);
    return response.json<{ id: number; slug: string }>();
  }

  it('orders bookmarks inside a category by addition order and appends moved bookmarks', async () => {
    const catA = await createCategory('SortCatA');
    const catB = await createCategory('SortCatB');
    const a1 = await createBookmark({
      title: 'A1',
      url: 'https://sort-a1.test',
      categoryId: catA.id,
    });
    const a2 = await createBookmark({
      title: 'A2',
      url: 'https://sort-a2.test',
      categoryId: catA.id,
    });
    const a3 = await createBookmark({
      title: 'A3',
      url: 'https://sort-a3.test',
      categoryId: catA.id,
    });
    const b1 = await createBookmark({
      title: 'B1',
      url: 'https://sort-b1.test',
      categoryId: catB.id,
    });

    expect([a1.sortOrder, a2.sortOrder, a3.sortOrder]).toEqual([0, 1, 2]);
    expect(
      (await listBookmarks(`?category=${catA.slug}&categoryOnly=true`)).page.items.map((i) => i.id),
    ).toEqual([a1.id, a2.id, a3.id]);

    // 编辑标题不改变 sortOrder
    const edited = await exports.default.fetch(`${API}/bookmarks/${a1.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'A1 Updated', categoryId: catA.id }),
    });
    expect((await edited.json<Bookmark>()).sortOrder).toBe(0);

    // 移动到新分类后追加到末尾
    const moved = await exports.default.fetch(`${API}/bookmarks/${a2.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ categoryId: catB.id }),
    });
    expect((await moved.json<Bookmark>()).sortOrder).toBe(1);
    expect(
      (await listBookmarks(`?category=${catB.slug}&categoryOnly=true`)).page.items.map((i) => i.id),
    ).toEqual([b1.id, a2.id]);
  });

  it('requires auth and validates reorder inputs without partial writes', async () => {
    const cat1 = await createCategory('ReorderVal1');
    const cat2 = await createCategory('ReorderVal2');
    const bm1 = await createBookmark({
      title: 'V1',
      url: 'https://reorder-v1.test',
      categoryId: cat1.id,
    });
    const bm2 = await createBookmark({
      title: 'V2',
      url: 'https://reorder-v2.test',
      categoryId: cat1.id,
    });
    const bmOther = await createBookmark({
      title: 'VO',
      url: 'https://reorder-vo.test',
      categoryId: cat2.id,
    });
    const bmArchived = await createBookmark({
      title: 'VA',
      url: 'https://reorder-va.test',
      categoryId: cat1.id,
    });
    await exports.default.fetch(`${API}/bookmarks/${bmArchived.id}/archive`, {
      method: 'POST',
      headers: adminHeaders,
    });

    const unauthed = await exports.default.fetch(`${API}/bookmarks/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [bm2.id, bm1.id] }),
    });
    expect(unauthed.status).toBe(401);

    const empty = await exports.default.fetch(`${API}/bookmarks/reorder`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ids: [] }),
    });
    expect(empty.status).toBe(400);

    const missing = await exports.default.fetch(`${API}/bookmarks/reorder`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ids: [bm2.id, 999999] }),
    });
    expect(missing.status).toBe(404);

    const mixed = await exports.default.fetch(`${API}/bookmarks/reorder`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ids: [bm1.id, bmOther.id] }),
    });
    expect(mixed.status).toBe(400);

    const archived = await exports.default.fetch(`${API}/bookmarks/reorder`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ids: [bm1.id, bmArchived.id] }),
    });
    expect(archived.status).toBe(400);

    expect(
      (await listBookmarks(`?category=${cat1.slug}&categoryOnly=true`)).page.items.map((i) => i.id),
    ).toEqual([bm1.id, bm2.id]);
  });

  it('reorders bookmarks, preserves pagination slots, handles zeroed orders, and rejects invalid manual cursors', async () => {
    const cat = await createCategory('ReorderSlots');
    const items = [];
    for (let index = 0; index < 5; index += 1) {
      items.push(
        await createBookmark({
          title: `S${index}`,
          url: `https://slot-${index}.test`,
          categoryId: cat.id,
        }),
      );
    }

    // 仅重排前 3 项，后 2 项位置保持不变
    const partial = await exports.default.fetch(`${API}/bookmarks/reorder`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ids: [items[2].id, items[0].id, items[1].id] }),
    });
    expect(partial.status).toBe(204);

    const page1 = await listBookmarks(`?category=${cat.slug}&categoryOnly=true&limit=3`);
    expect(page1.page.items.map((i) => i.id)).toEqual([items[2].id, items[0].id, items[1].id]);
    expect(page1.page.nextCursor).toBeTruthy();

    const page2 = await listBookmarks(
      `?category=${cat.slug}&categoryOnly=true&limit=3&cursor=${encodeURIComponent(page1.page.nextCursor!)}`,
    );
    expect(page2.page.items.map((i) => i.id)).toEqual([items[3].id, items[4].id]);
    expect(page2.page.nextCursor).toBeNull();

    const offsetPage = await listBookmarks(
      `?category=${cat.slug}&categoryOnly=true&offset=1&limit=2`,
    );
    expect(offsetPage.page.items.map((i) => i.id)).toEqual([items[0].id, items[1].id]);

    // 非法手动排序游标
    const badCursor = btoa(JSON.stringify({ sortOrder: -1, id: 1 }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    const invalidCursorResp = await exports.default.fetch(
      `${API}/bookmarks?category=${cat.slug}&categoryOnly=true&cursor=${badCursor}`,
      { headers: adminHeaders },
    );
    expect(invalidCursorResp.status).toBe(400);

    // 模拟未分类书签重排及 D1 绑定参数边界（35 条 > REORDER_CHUNK_SIZE=30）
    const bulkCat = await createCategory('ReorderBulk');
    const bulk = [];
    for (let index = 0; index < 35; index += 1) {
      bulk.push(
        await createBookmark({
          title: `Bulk${index}`,
          url: `https://bulk-sort-${index}.test`,
          categoryId: bulkCat.id,
        }),
      );
    }
    const reversedIds = bulk.map((item) => item.id).reverse();
    const bulkResp = await exports.default.fetch(`${API}/bookmarks/reorder`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ids: reversedIds }),
    });
    expect(bulkResp.status).toBe(204);
    const fetchedBulk = await listBookmarks(`?category=${bulkCat.slug}&categoryOnly=true&limit=50`);
    expect(fetchedBulk.page.items.map((i) => i.id)).toEqual(reversedIds);
  });
});
