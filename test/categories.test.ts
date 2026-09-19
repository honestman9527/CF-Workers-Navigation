import type { Bookmark, BookmarkPage, Category } from '../src/shared/api/types';

import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const API = 'https://example.com/api/v1';
const adminHeaders = { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' };

async function createCategory(input: Record<string, unknown>): Promise<Category> {
  const response = await exports.default.fetch(`${API}/categories`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return response.json<Category>();
}

async function createBookmark(input: Record<string, unknown>): Promise<Bookmark> {
  const response = await exports.default.fetch(`${API}/bookmarks`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return response.json<Bookmark>();
}

async function listCategories(): Promise<Category[]> {
  const response = await exports.default.fetch(`${API}/categories`, { headers: adminHeaders });
  expect(response.status).toBe(200);
  return response.json<Category[]>();
}

async function listBookmarks(query = ''): Promise<{ response: Response; page: BookmarkPage }> {
  const response = await exports.default.fetch(`${API}/bookmarks${query}`, {
    headers: adminHeaders,
  });
  return { response, page: await response.json<BookmarkPage>() };
}

describe('categories api', () => {
  it('requires auth for category management', async () => {
    const responses = await Promise.all([
      exports.default.fetch(`${API}/categories`),
      exports.default.fetch(`${API}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' }),
      }),
      exports.default.fetch(`${API}/categories/1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' }),
      }),
      exports.default.fetch(`${API}/categories/1`, { method: 'DELETE' }),
      exports.default.fetch(`${API}/categories/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [1] }),
      }),
    ]);
    expect(responses[0].status).toBe(200);
    expect(responses.slice(1).every((response) => response.status === 401)).toBe(true);
  });

  it('creates a nested category tree with counts', async () => {
    const work = await createCategory({ name: '工作', icon: 'Folder' });
    const frontend = await createCategory({ name: '前端', parentId: work.id });
    const backend = await createCategory({ name: '后端', parentId: work.id });
    expect(frontend.parentId).toBe(work.id);
    expect(frontend.slug).toBe('前端');

    await createBookmark({
      title: 'React',
      url: 'https://react-cat.example.com',
      categoryId: frontend.id,
      tags: ['框架'],
    });
    await createBookmark({
      title: 'Work home',
      url: 'https://work-cat.example.com',
      categoryId: work.id,
    });

    const categories = await listCategories();
    const match = (category: Category) => categories.find((item) => item.id === category.id);
    expect(match(work)?.bookmarkCount).toBe(1);
    expect(match(frontend)?.bookmarkCount).toBe(1);
    expect(match(backend)?.bookmarkCount).toBe(0);
  });

  it('rejects duplicate names and reserved slugs', async () => {
    const first = await createCategory({ name: '重名检查' });
    expect(first.id).toBeGreaterThan(0);
    const duplicate = await exports.default.fetch(`${API}/categories`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: '重名检查' }),
    });
    expect(duplicate.status).toBe(409);

    const reserved = await exports.default.fetch(`${API}/categories`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'uncategorized' }),
    });
    expect(reserved.status).toBe(400);
  });

  it('rejects a missing parent and malformed input', async () => {
    const missingParent = await exports.default.fetch(`${API}/categories`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: '孤儿', parentId: 9999 }),
    });
    expect(missingParent.status).toBe(404);

    const invalid = await exports.default.fetch(`${API}/categories`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: '   ' }),
    });
    expect(invalid.status).toBe(400);
  });

  it('renames and prevents moving a category into its own subtree', async () => {
    const root = await createCategory({ name: 'Root' });
    const child = await createCategory({ name: 'Child', parentId: root.id });
    const grandchild = await createCategory({ name: 'Grandchild', parentId: child.id });

    const renamed = await exports.default.fetch(`${API}/categories/${child.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Child Renamed', icon: 'Star' }),
    });
    expect(renamed.status).toBe(200);
    const renamedBody = await renamed.json<Category>();
    expect(renamedBody.name).toBe('Child Renamed');
    expect(renamedBody.slug).toBe('child-renamed');
    expect(renamedBody.icon).toBe('Star');

    // 移到自身 → 400
    const selfMove = await exports.default.fetch(`${API}/categories/${root.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ parentId: root.id }),
    });
    expect(selfMove.status).toBe(400);

    // 把 grandchild 的父级设为 root（合法，不再是指向自己后代）
    const okMove = await exports.default.fetch(`${API}/categories/${grandchild.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ parentId: root.id }),
    });
    expect(okMove.status).toBe(200);

    // 把 root 移入 grandchild → 循环，400
    const cycleMove = await exports.default.fetch(`${API}/categories/${root.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ parentId: grandchild.id }),
    });
    expect(cycleMove.status).toBe(400);
  });

  it('reparents children and unassigns bookmarks when deleting a category', async () => {
    const grandparent = await createCategory({ name: '祖父' });
    const parent = await createCategory({ name: '父', parentId: grandparent.id });
    const borrowed = await createCategory({ name: '子', parentId: parent.id });
    const bookmark = await createBookmark({
      title: 'In category',
      url: 'https://in-cat-delete.example.com',
      categoryId: parent.id,
    });

    const deleted = await exports.default.fetch(`${API}/categories/${parent.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    expect(deleted.status).toBe(204);

    const categories = await listCategories();
    expect(categories.find((item) => item.id === parent.id)).toBeUndefined();
    expect(categories.find((item) => item.id === borrowed.id)?.parentId).toBe(grandparent.id);

    const detail = await exports.default.fetch(`${API}/bookmarks/${bookmark.id}`, {
      headers: adminHeaders,
    });
    expect((await detail.json<Bookmark>()).categoryId).toBeNull();
  });

  it('reorders siblings and rejects mixed-parent lists', async () => {
    const root = await createCategory({ name: 'Sort Root' });
    const first = await createCategory({ name: 'A', parentId: root.id });
    const second = await createCategory({ name: 'B', parentId: root.id });
    const other = await createCategory({ name: 'C' });

    const reordered = await exports.default.fetch(`${API}/categories/reorder`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ids: [second.id, first.id] }),
    });
    expect(reordered.status).toBe(204);

    const categories = await listCategories();
    const orderA = categories.find((item) => item.id === first.id)?.sortOrder;
    const orderB = categories.find((item) => item.id === second.id)?.sortOrder;
    expect(orderA).toBeGreaterThanOrEqual(0);
    expect(orderB).toBe(0);
    expect(orderA).toBeGreaterThan(orderB!);

    const mixed = await exports.default.fetch(`${API}/categories/reorder`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ids: [first.id, other.id] }),
    });
    expect(mixed.status).toBe(400);
  });
});

describe('bookmark category filter', () => {
  it('filters by category including its subtree and combines with tags', async () => {
    const work = await createCategory({ name: '开发' });
    const docs = await createCategory({ name: '文档', parentId: work.id });
    const life = await createCategory({ name: '生活' });
    const direct = await createBookmark({
      title: '开发首页',
      url: 'https://dev-home.example.com',
      categoryId: work.id,
      tags: ['工具'],
    });
    const child = await createBookmark({
      title: '文档页',
      url: 'https://docs-page.example.com',
      categoryId: docs.id,
      tags: ['工具'],
    });
    const lifeBm = await createBookmark({
      title: '生活站',
      url: 'https://life.example.com',
      categoryId: life.id,
    });
    const uncategorized = await createBookmark({
      title: '散落',
      url: 'https://loose.example.com',
      tags: ['工具'],
    });

    const subtree = await listBookmarks(`?category=${encodeURIComponent(work.slug)}`);
    expect(subtree.page.items.map(({ id }) => id).sort()).toEqual([direct.id, child.id].sort());

    const directOnly = await listBookmarks(`?category=${encodeURIComponent(docs.slug)}`);
    expect(directOnly.page.items.map(({ id }) => id)).toEqual([child.id]);

    const uncat = await listBookmarks('?category=uncategorized');
    const uncatIds = uncat.page.items.map(({ id }) => id);
    expect(uncatIds).toContain(uncategorized.id);
    expect(uncatIds).not.toContain(direct.id);
    expect(uncatIds).not.toContain(child.id);

    const combined = await listBookmarks(`?category=${encodeURIComponent(work.slug)}&tag=工具`);
    expect(combined.page.items.map(({ id }) => id)).toEqual(
      expect.arrayContaining([direct.id, child.id]),
    );
    expect(combined.page.items.map(({ id }) => id)).not.toContain(lifeBm.id);

    // 未知分类 → 空结果
    const unknown = await listBookmarks('?category=nonexistent-category');
    expect(unknown.page.items).toEqual([]);
  });

  it('assigns and updates a category on a bookmark', async () => {
    const category = await createCategory({ name: '工具' });
    const created = await createBookmark({
      title: 'Category write',
      url: 'https://cat-write.example.com',
      categoryId: category.id,
    });
    expect(created.categoryId).toBe(category.id);
    expect(created.categoryName).toBe('工具');
    expect(created.categorySlug).toBe('工具');

    const updated = await exports.default.fetch(`${API}/bookmarks/${created.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ categoryId: null }),
    });
    expect((await updated.json<Bookmark>()).categoryId).toBeNull();

    const invalid = await exports.default.fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'Bad', url: 'https://bad-cat.example.com', categoryId: 99999 }),
    });
    expect(invalid.status).toBe(404);
  });

  it('applies the category filter to search and paginates', async () => {
    const category = await createCategory({ name: 'SearchCat' });
    const one = await createBookmark({
      title: 'Search Cat Shared',
      url: 'https://cat-search-1.example.com',
      categoryId: category.id,
    });
    const two = await createBookmark({
      title: 'Search Cat Shared',
      url: 'https://cat-search-2.example.com',
      categoryId: category.id,
    });
    await createBookmark({ title: 'Search Cat Other', url: 'https://cat-search-3.example.com' });

    const endpoint = new URL(`${API}/bookmarks/search`);
    endpoint.searchParams.set('q', 'cat shared');
    endpoint.searchParams.set('category', category.slug);
    endpoint.searchParams.set('limit', '1');
    const first = await exports.default.fetch(endpoint, { headers: adminHeaders });
    const firstPage = await first.json<BookmarkPage>();
    expect(firstPage.items).toHaveLength(1);

    const secondEndpoint = new URL(`${API}/bookmarks/search`);
    secondEndpoint.searchParams.set('q', 'cat shared');
    secondEndpoint.searchParams.set('category', category.slug);
    secondEndpoint.searchParams.set('limit', '1');
    secondEndpoint.searchParams.set('cursor', firstPage.nextCursor!);
    const second = await exports.default.fetch(secondEndpoint, { headers: adminHeaders });
    const secondPage = await second.json<BookmarkPage>();
    expect([...firstPage.items, ...secondPage.items].map(({ id }) => id).sort()).toEqual(
      [one.id, two.id].sort(),
    );
  });

  it('rejects an overlong category query value', async () => {
    const response = await exports.default.fetch(
      `${API}/bookmarks?category=${encodeURIComponent('x'.repeat(65))}`,
      {
        headers: adminHeaders,
      },
    );
    expect(response.status).toBe(400);
  });
});
