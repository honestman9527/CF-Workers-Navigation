import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const adminHeaders = { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' };

async function createCategory(name: string, extra: Record<string, unknown> = {}) {
  const response = await exports.default.fetch('https://example.com/api/categories', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ name, ...extra }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: number };
}

async function createBookmark(input: Record<string, unknown>) {
  const response = await exports.default.fetch('https://example.com/api/bookmarks', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as {
    id: number;
    title: string;
    categoryId: number;
    isPinned: boolean;
  };
}

async function searchBookmarks(query: string) {
  const endpoint = new URL('https://example.com/api/bookmarks/search');
  endpoint.searchParams.set('q', query);
  const response = await exports.default.fetch(endpoint.toString(), { headers: adminHeaders });
  return {
    status: response.status,
    json:
      response.status === 200
        ? ((await response.json()) as Array<{ id: number; title: string }>)
        : null,
  };
}

describe('bookmarks api', () => {
  it('creates and lists bookmarks in a folder', async () => {
    const category = await createCategory('bookmark-folder');
    await createBookmark({
      categoryId: category.id,
      title: 'Cloudflare',
      url: 'https://www.cloudflare.com',
      sortOrder: 1,
    });

    const listResponse = await exports.default.fetch(
      `https://example.com/api/bookmarks?category=${category.id}`,
      { headers: adminHeaders },
    );

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject([{ title: 'Cloudflare' }]);
  });

  it('lists bookmarks from a folder subtree when requested', async () => {
    const parent = await createCategory('bookmark-subtree-parent');
    const child = await createCategory('bookmark-subtree-child');
    const moveChild = await exports.default.fetch(
      `https://example.com/api/categories/${child.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ parentId: parent.id }),
      },
    );
    expect(moveChild.status).toBe(200);

    const parentBookmark = await createBookmark({
      categoryId: parent.id,
      title: 'Parent Visible',
      url: 'https://example.com/subtree-parent',
      sortOrder: 1,
    });
    const childBookmark = await createBookmark({
      categoryId: child.id,
      title: 'Child Visible',
      url: 'https://example.com/subtree-child',
      sortOrder: 2,
    });

    const response = await exports.default.fetch(
      `https://example.com/api/bookmarks?category=${parent.id}&includeChildren=1`,
      { headers: adminHeaders },
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as Array<{ id: number }>;
    expect(json.map((bookmark) => bookmark.id)).toEqual([parentBookmark.id, childBookmark.id]);
  });

  it('requires auth for every bookmark read and write', async () => {
    const category = await createCategory('bookmark-auth-category');
    const bookmark = await createBookmark({
      categoryId: category.id,
      title: 'Writable',
      url: 'https://example.com',
    });

    const list = await exports.default.fetch('https://example.com/api/bookmarks');
    const detail = await exports.default.fetch(`https://example.com/api/bookmarks/${bookmark.id}`);
    const post = await exports.default.fetch('https://example.com/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: category.id, title: 'Nope', url: 'https://example.com' }),
    });
    const put = await exports.default.fetch(`https://example.com/api/bookmarks/${bookmark.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Nope' }),
    });
    const patch = await exports.default.fetch('https://example.com/api/bookmarks/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: bookmark.id, sortOrder: 1 }] }),
    });
    const del = await exports.default.fetch(`https://example.com/api/bookmarks/${bookmark.id}`, {
      method: 'DELETE',
    });

    expect(list.status).toBe(401);
    expect(detail.status).toBe(401);
    expect(post.status).toBe(401);
    expect(put.status).toBe(401);
    expect(patch.status).toBe(401);
    expect(del.status).toBe(401);
  });

  it('returns validation error for malformed JSON on write', async () => {
    const response = await exports.default.fetch('https://example.com/api/bookmarks', {
      method: 'POST',
      headers: adminHeaders,
      body: '{',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'validation_error', message: 'Invalid JSON' },
    });
  });

  it('rejects invalid icon URLs', async () => {
    const category = await createCategory('bookmark-invalid-icon-category');

    const response = await exports.default.fetch('https://example.com/api/bookmarks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        categoryId: category.id,
        title: 'Invalid Icon',
        url: 'https://example.com/invalid-icon',
        iconUrl: 'not-a-url',
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'validation_error' },
    });
  });

  it('updates, reorders, rejects cross-folder reorder, and deletes bookmarks', async () => {
    const category = await createCategory('bookmark-mutation-category');
    const otherCategory = await createCategory('bookmark-other-category');
    const first = await createBookmark({
      categoryId: category.id,
      title: 'First',
      url: 'https://example.com/first',
      sortOrder: 1,
    });
    const second = await createBookmark({
      categoryId: category.id,
      title: 'Second',
      url: 'https://example.com/second',
      sortOrder: 2,
    });
    const other = await createBookmark({
      categoryId: otherCategory.id,
      title: 'Other',
      url: 'https://example.com/other',
      sortOrder: 1,
    });

    const updateResponse = await exports.default.fetch(
      `https://example.com/api/bookmarks/${first.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ title: 'First Updated' }),
      },
    );
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({ title: 'First Updated' });

    const crossCategory = await exports.default.fetch('https://example.com/api/bookmarks/reorder', {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        items: [
          { id: first.id, sortOrder: 1 },
          { id: other.id, sortOrder: 2 },
        ],
      }),
    });
    expect(crossCategory.status).toBe(400);

    const reorderResponse = await exports.default.fetch(
      'https://example.com/api/bookmarks/reorder',
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          items: [
            { id: first.id, sortOrder: 2 },
            { id: second.id, sortOrder: 1 },
          ],
        }),
      },
    );
    expect(reorderResponse.status).toBe(200);

    const listResponse = await exports.default.fetch(
      `https://example.com/api/bookmarks?category=${category.id}`,
      { headers: adminHeaders },
    );
    const listJson = (await listResponse.json()) as Array<{ id: number }>;
    expect(listJson[0].id).toBe(second.id);

    const deleteResponse = await exports.default.fetch(
      `https://example.com/api/bookmarks/${first.id}`,
      {
        method: 'DELETE',
        headers: adminHeaders,
      },
    );
    expect(deleteResponse.status).toBe(204);

    const deleteAgain = await exports.default.fetch(
      `https://example.com/api/bookmarks/${first.id}`,
      {
        method: 'DELETE',
        headers: adminHeaders,
      },
    );
    expect(deleteAgain.status).toBe(404);
  });
});

describe('bookmarks search', () => {
  it('keeps search available through organization-only updates and replaces changed terms', async () => {
    const category = await createCategory('search-trigger-category');
    const bookmark = await createBookmark({
      categoryId: category.id,
      title: 'OldTermUnique',
      url: 'https://example.com/trigger-destination',
    });

    expect((await searchBookmarks('OldTermUnique')).json).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: bookmark.id })]),
    );

    const organizationUpdate = await exports.default.fetch(
      `https://example.com/api/bookmarks/${bookmark.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ isPinned: true, sortOrder: 10 }),
      },
    );
    expect(organizationUpdate.status).toBe(200);
    expect((await searchBookmarks('OldTermUnique')).json).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: bookmark.id })]),
    );

    const contentUpdate = await exports.default.fetch(
      `https://example.com/api/bookmarks/${bookmark.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ title: 'NewTermUnique' }),
      },
    );
    expect(contentUpdate.status).toBe(200);
    expect((await searchBookmarks('OldTermUnique')).json).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: bookmark.id })]),
    );
    expect((await searchBookmarks('NewTermUnique')).json).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: bookmark.id })]),
    );
  });

  it('returns matching bookmarks by title', async () => {
    const category = await createCategory('search-title-category');
    const match = await createBookmark({
      categoryId: category.id,
      title: 'Cloudflare Workers Docs',
      url: 'https://example.com/cf-workers',
    });
    await createBookmark({
      categoryId: category.id,
      title: 'Unrelated Site',
      url: 'https://example.com/unrelated',
    });

    const { status, json } = await searchBookmarks('cloudflare');
    expect(status).toBe(200);
    expect(json?.map((bookmark) => bookmark.id)).toContain(match.id);
  });

  it('matches by prefix without trailing wildcard', async () => {
    const category = await createCategory('search-prefix-category');
    const match = await createBookmark({
      categoryId: category.id,
      title: 'React Router Documentation',
      url: 'https://example.com/react-router',
    });

    const { status, json } = await searchBookmarks('react');
    expect(status).toBe(200);
    expect(json?.map((bookmark) => bookmark.id)).toContain(match.id);
  });

  it('matches any word in multi-word OR queries', async () => {
    const category = await createCategory('search-or-category');
    const google = await createBookmark({
      categoryId: category.id,
      title: 'Google Search',
      url: 'https://example.com/google',
    });
    const maps = await createBookmark({
      categoryId: category.id,
      title: 'Maps Service',
      url: 'https://example.com/maps',
    });

    const { status, json } = await searchBookmarks('google maps');
    expect(status).toBe(200);
    const ids = json?.map((bookmark) => bookmark.id).sort();
    expect(ids).toEqual([google.id, maps.id].sort());
  });

  it('handles special characters without error: C++', async () => {
    const category = await createCategory('search-cpp-category');
    const match = await createBookmark({
      categoryId: category.id,
      title: 'Learn C++ Today',
      url: 'https://example.com/cpp',
    });

    const { status, json } = await searchBookmarks('C++');
    expect(status).toBe(200);
    expect(json?.map((bookmark) => bookmark.id)).toContain(match.id);
  });

  it('handles special characters without error: unclosed quote', async () => {
    const { status } = await searchBookmarks('"react');
    expect(status).toBe(200);
  });

  it('handles special characters without error: asterisk', async () => {
    const { status } = await searchBookmarks('*');
    expect(status).toBe(200);
  });

  it('handles special characters without error: parenthesis', async () => {
    const { status } = await searchBookmarks('(test');
    expect(status).toBe(200);
  });

  it('matches by url and description fields', async () => {
    const category = await createCategory('search-fields-category');
    const byUrl = await createBookmark({
      categoryId: category.id,
      title: 'Project Homepage',
      url: 'https://nodejs.org/en',
      description: 'Runtime overview',
    });
    const byDesc = await createBookmark({
      categoryId: category.id,
      title: 'Some Tool',
      url: 'https://example.com/tool',
      description: 'Powered by nodejs runtime',
    });

    const { status, json } = await searchBookmarks('nodejs');
    expect(status).toBe(200);
    const ids = json?.map((bookmark) => bookmark.id).sort();
    expect(ids).toEqual([byUrl.id, byDesc.id].sort());
  });

  it('returns empty array when no bookmarks match', async () => {
    const { status, json } = await searchBookmarks('zzznoresultzzz');
    expect(status).toBe(200);
    expect(json).toEqual([]);
  });

  it('requires auth for search', async () => {
    const response = await exports.default.fetch(
      'https://example.com/api/bookmarks/search?q=cloudflare',
    );
    expect(response.status).toBe(401);
  });
});

describe('bookmarks pinned', () => {
  it('returns only pinned bookmarks via /pinned endpoint', async () => {
    const category = await createCategory('pinned-list-category');
    const pinned = await createBookmark({
      categoryId: category.id,
      title: 'Pinned Site',
      url: 'https://example.com/pinned-list',
      isPinned: true,
    });
    const unpinned = await createBookmark({
      categoryId: category.id,
      title: 'Unpinned Site',
      url: 'https://example.com/unpinned-list',
      isPinned: false,
    });

    const response = await exports.default.fetch('https://example.com/api/bookmarks/pinned', {
      headers: adminHeaders,
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as Array<{ id: number }>;
    const ids = json.map((bookmark) => bookmark.id);
    expect(ids).toContain(pinned.id);
    expect(ids).not.toContain(unpinned.id);
  });

  it('creates a bookmark with isPinned', async () => {
    const category = await createCategory('pinned-create-category');
    const response = await exports.default.fetch('https://example.com/api/bookmarks', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        categoryId: category.id,
        title: 'Pinned on Create',
        url: 'https://example.com/pinned-create',
        isPinned: true,
      }),
    });
    expect(response.status).toBe(201);
    const created = (await response.json()) as { isPinned: boolean };
    expect(created.isPinned).toBe(true);
  });

  it('toggles isPinned via update', async () => {
    const category = await createCategory('pinned-toggle-category');
    const created = await createBookmark({
      categoryId: category.id,
      title: 'Toggle Pin',
      url: 'https://example.com/pinned-toggle',
    });

    const pinResponse = await exports.default.fetch(
      `https://example.com/api/bookmarks/${created.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ isPinned: true }),
      },
    );
    expect(pinResponse.status).toBe(200);
    const pinned = (await pinResponse.json()) as { isPinned: boolean };
    expect(pinned.isPinned).toBe(true);

    const listResponse = await exports.default.fetch('https://example.com/api/bookmarks/pinned', {
      headers: adminHeaders,
    });
    const list = (await listResponse.json()) as Array<{ id: number }>;
    expect(list.map((bookmark) => bookmark.id)).toContain(created.id);

    const unpinResponse = await exports.default.fetch(
      `https://example.com/api/bookmarks/${created.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ isPinned: false }),
      },
    );
    expect(unpinResponse.status).toBe(200);
    const unpinned = (await unpinResponse.json()) as { isPinned: boolean };
    expect(unpinned.isPinned).toBe(false);
  });
});
