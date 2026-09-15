import type { Bookmark, BookmarkPage, Tag } from '../src/shared/api/types';

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
    expect(created).not.toHaveProperty('sortOrder');

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

  it('requires auth for reads and writes', async () => {
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

    expect(responses.every((response) => response.status === 401)).toBe(true);
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

    const invalidPinned = await exports.default.fetch(`${API}/bookmarks?pinned=maybe`, {
      headers: adminHeaders,
    });
    expect(invalidPinned.status).toBe(400);
  });

  it('rejects duplicate active URLs after normalization', async () => {
    await createBookmark({ title: 'First', url: 'https://duplicate.example.com/path/' });
    const duplicate = await exports.default.fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'Second', url: 'https://DUPLICATE.example.com/path#section' }),
    });

    expect(duplicate.status).toBe(409);
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

  it('combines tag, pinned, and status filters', async () => {
    const pinned = await createBookmark({
      title: 'Pinned React',
      url: 'https://pinned-react.example.com',
      isPinned: true,
      tags: ['React'],
    });
    await createBookmark({
      title: 'Unpinned React',
      url: 'https://unpinned-react.example.com',
      tags: ['React'],
    });
    const archived = await createBookmark({
      title: 'Archived React',
      url: 'https://archived-react.example.com',
      isPinned: true,
      tags: ['React'],
    });
    await exports.default.fetch(`${API}/bookmarks/${archived.id}/archive`, {
      method: 'POST',
      headers: adminHeaders,
    });

    const filtered = await listBookmarks('?tag=react&pinned=1');
    expect(filtered.page.items.map(({ id }) => id)).toEqual([pinned.id]);
    const archive = await listBookmarks('?view=archive&tag=react');
    expect(archive.page.items.map(({ id }) => id)).toContain(archived.id);
    expect(archive.page.items[0]?.isPinned).toBe(false);
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

    const response = await exports.default.fetch(`${API}/bookmarks/tags`, {
      headers: adminHeaders,
    });
    expect(response.status).toBe(200);
    const tags = await response.json<Tag[]>();
    expect(tags.find((tag) => tag.slug === 'testing')?.bookmarkCount).toBe(1);
    expect(active.id).toBeGreaterThan(0);
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

  it('applies view, tag, and pinned filters to search', async () => {
    const pinned = await createBookmark({
      title: 'Filtered Search Shared',
      url: 'https://filtered-search-pinned.example.com',
      tags: ['SearchFilter'],
      isPinned: true,
    });
    await createBookmark({
      title: 'Filtered Search Shared',
      url: 'https://filtered-search-unpinned.example.com',
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
      pinned: '1',
    });
    expect(active.page?.items.map(({ id }) => id)).toEqual([pinned.id]);
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
    const uncategorized = ids((await listBookmarks('?category=uncategorized')).page);
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
