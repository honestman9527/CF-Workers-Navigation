import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const adminHeaders = {
  Authorization: 'Bearer dev-password',
  'Content-Type': 'application/json',
};

async function createCategory(input: Record<string, unknown>) {
  const response = await exports.default.fetch('https://example.com/api/categories', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: number; slug: string; parentId: number | null };
}

async function createBookmark(input: Record<string, unknown>) {
  const response = await exports.default.fetch('https://example.com/api/bookmarks', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: number; title: string };
}

describe('categories api', () => {
  it('creates nested folders and returns a tree', async () => {
    const root = await createCategory({ name: 'Tools', icon: 'box', sortOrder: 1 });
    await createCategory({ name: 'Dev', parentId: root.id, sortOrder: 1 });

    const tree = await exports.default.fetch('https://example.com/api/categories', {
      headers: adminHeaders,
    });

    expect(tree.status).toBe(200);
    expect(await tree.json()).toMatchObject([
      {
        id: root.id,
        name: 'Tools',
        slug: 'tools',
        parentId: null,
        sortOrder: 1,
        children: [{ name: 'Dev', slug: 'dev', parentId: root.id }],
      },
    ]);
  });

  it('requires auth for folder reads and writes', async () => {
    const category = await createCategory({ name: 'Protected Category' });

    const readResponse = await exports.default.fetch('https://example.com/api/categories');
    const createResponse = await exports.default.fetch('https://example.com/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Private' }),
    });
    const updateResponse = await exports.default.fetch(
      `https://example.com/api/categories/${category.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized Update' }),
      },
    );
    const reorderResponse = await exports.default.fetch(
      'https://example.com/api/categories/reorder',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: category.id, sortOrder: 1 }] }),
      },
    );
    const deleteResponse = await exports.default.fetch(
      `https://example.com/api/categories/${category.id}`,
      {
        method: 'DELETE',
      },
    );

    expect(readResponse.status).toBe(401);
    expect(createResponse.status).toBe(401);
    expect(updateResponse.status).toBe(401);
    expect(reorderResponse.status).toBe(401);
    expect(deleteResponse.status).toBe(401);
  });

  it('returns validation error for malformed JSON on folder writes', async () => {
    const category = await createCategory({ name: 'Malformed JSON' });
    const createResponse = await exports.default.fetch('https://example.com/api/categories', {
      method: 'POST',
      headers: adminHeaders,
      body: '{',
    });
    const updateResponse = await exports.default.fetch(
      `https://example.com/api/categories/${category.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: '{',
      },
    );
    const reorderResponse = await exports.default.fetch(
      'https://example.com/api/categories/reorder',
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: '{',
      },
    );

    for (const response of [createResponse, updateResponse, reorderResponse]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: 'validation_error', message: 'Invalid JSON' },
      });
    }
  });

  it('returns bookmark counts without embedding bookmark payloads', async () => {
    const category = await createCategory({ name: 'Tree Bookmark Counts' });
    const child = await createCategory({
      name: 'Tree Bookmark Count Child',
      parentId: category.id,
    });
    await createBookmark({
      categoryId: category.id,
      title: 'Root Bookmark',
      url: 'https://example.com/public-tree',
      sortOrder: 1,
    });
    await createBookmark({
      categoryId: category.id,
      title: 'Another Root Bookmark',
      url: 'https://example.com/private-tree',
      sortOrder: 2,
    });
    await createBookmark({
      categoryId: child.id,
      title: 'Child Bookmark',
      url: 'https://example.com/child-public-tree',
      sortOrder: 1,
    });

    const response = await exports.default.fetch('https://example.com/api/categories', {
      headers: adminHeaders,
    });
    expect(response.status).toBe(200);
    const tree = (await response.json()) as Array<{
      id: number;
      bookmarkCount: number;
      totalBookmarkCount: number;
      bookmarks?: unknown[];
      children: Array<{
        id: number;
        bookmarkCount: number;
        totalBookmarkCount: number;
        bookmarks?: unknown[];
      }>;
    }>;
    const node = tree.find((item) => item.id === category.id);
    const childNode = node?.children.find((item) => item.id === child.id);
    expect(node).toMatchObject({ bookmarkCount: 2, totalBookmarkCount: 3 });
    expect(childNode).toMatchObject({ bookmarkCount: 1, totalBookmarkCount: 1 });
    expect(node?.bookmarks).toBeUndefined();
    expect(childNode?.bookmarks).toBeUndefined();
  });

  it('updates category parent and rejects cycles', async () => {
    const parent = await createCategory({ name: 'Parent' });
    const child = await createCategory({ name: 'Child', parentId: parent.id });

    const cycleResponse = await exports.default.fetch(
      `https://example.com/api/categories/${parent.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ parentId: child.id }),
      },
    );

    expect(cycleResponse.status).toBe(400);

    const moveResponse = await exports.default.fetch(
      `https://example.com/api/categories/${child.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ parentId: null, name: 'Child Root' }),
      },
    );

    expect(moveResponse.status).toBe(200);
    expect(await moveResponse.json()).toMatchObject({
      id: child.id,
      name: 'Child Root',
      parentId: null,
    });
  });

  it('reorders folders only within the same parent', async () => {
    const parent = await createCategory({ name: 'Reorder Parent' });
    const first = await createCategory({
      name: 'First',
      parentId: parent.id,
      sortOrder: 1,
    });
    const second = await createCategory({
      name: 'Second',
      parentId: parent.id,
      sortOrder: 2,
    });

    const response = await exports.default.fetch('https://example.com/api/categories/reorder', {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        items: [
          { id: first.id, sortOrder: 2 },
          { id: second.id, sortOrder: 1 },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const tree = await exports.default.fetch('https://example.com/api/categories', {
      headers: adminHeaders,
    });
    const json = (await tree.json()) as Array<{ id: number; children: Array<{ slug: string }> }>;
    const reorderedParent = json.find((category) => category.id === parent.id);
    expect(reorderedParent?.children[0].slug).toBe('second');
  });

  it('rejects reorder across different parents', async () => {
    const root = await createCategory({ name: 'Mixed Root' });
    const child = await createCategory({ name: 'Mixed Child', parentId: root.id });
    const otherRoot = await createCategory({ name: 'Mixed Other' });

    const response = await exports.default.fetch('https://example.com/api/categories/reorder', {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        items: [
          { id: child.id, sortOrder: 1 },
          { id: otherRoot.id, sortOrder: 2 },
        ],
      }),
    });

    expect(response.status).toBe(400);
  });

  it('deletes a folder', async () => {
    const parent = await createCategory({ name: 'Delete Parent' });

    const deleteResponse = await exports.default.fetch(
      `https://example.com/api/categories/${parent.id}`,
      {
        method: 'DELETE',
        headers: adminHeaders,
      },
    );

    expect(deleteResponse.status).toBe(204);
  });

  it('returns the tree without error when there are many folders', async () => {
    const batchName = 'limit-batch';
    for (let i = 0; i < 130; i += 1) {
      await createCategory({ name: `${batchName}-${i}` });
    }

    const response = await exports.default.fetch('https://example.com/api/categories', {
      headers: adminHeaders,
    });

    expect(response.status).toBe(200);
    const tree = (await response.json()) as Array<{ name: string }>;
    expect(tree.some((category) => category.name === `${batchName}-0`)).toBe(true);
    expect(tree.some((category) => category.name === `${batchName}-129`)).toBe(true);
  });
});
