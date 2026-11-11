import type { Category, ImportSummary } from '../../src/shared/api/types';

import { env, exports } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';

const headers = { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' };
const write = (path: string, body: unknown, method = 'POST') =>
  exports.default.fetch(`https://example.com/api/v1${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
async function category(name: string, parentId?: number) {
  const response = await write('/categories', { name, parentId, visibility: 'public' });
  expect(response.status).toBe(201);
  return response.json<Category>();
}
const migration = () => env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0003'))!;
beforeEach(async () => {
  await env.DB.batch([
    ...['bookmark_tags', 'bookmarks', 'categories', 'tags', 'settings'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
    env.DB.prepare('DROP TRIGGER IF EXISTS categories_depth_insert'),
    env.DB.prepare('DROP TRIGGER IF EXISTS categories_depth_update'),
    ...migration()
      .queries.filter((query) => query.includes('CREATE TRIGGER categories_depth_'))
      .map((query) => env.DB.prepare(query)),
  ]);
});
async function legacyTree() {
  await env.DB.batch([
    env.DB.prepare('DROP TRIGGER categories_depth_insert'),
    env.DB.prepare('DROP TRIGGER categories_depth_update'),
    env.DB.prepare(
      "INSERT INTO categories(id,name,slug,parent_id,visibility,sort_order) VALUES (101,'Root','root',NULL,'public',0),(102,'Private','private',101,'private',4),(103,'Deep','deep',102,'public',0),(104,'Deeper','deeper',103,'public',0),(105,'Sibling','sibling',101,'public',8),(106,'SecretRoot','secret-root',NULL,'private',1),(107,'Child','child',106,'public',0),(108,'Kept','kept',107,'public',0)",
    ),
    env.DB.prepare(
      "INSERT INTO bookmarks(id,title,url,url_normalized,category_id,visibility) VALUES(101,'Kept bookmark','https://kept.example.com','https://kept.example.com',104,'public')",
    ),
  ]);
}

it('rejects third-level creates, moves to a child, and moving a populated root under another root', async () => {
  const root = await category('Root');
  const child = await category('Child', root.id);
  const other = await category('Other');
  for (const [path, body, method] of [
    ['/categories', { name: 'Too deep', parentId: child.id }, 'POST'],
    [`/categories/${other.id}`, { parentId: child.id }, 'PUT'],
    [`/categories/${root.id}`, { parentId: other.id }, 'PUT'],
  ] as const) {
    const response = await write(path, body, method);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'validation_error', message: expect.stringContaining('2 层') },
    });
  }
  expect(
    await env.DB.prepare('SELECT parent_id FROM categories WHERE id=?')
      .bind(root.id)
      .first('parent_id'),
  ).toBeNull();
  expect((await write(`/categories/${child.id}`, { parentId: other.id }, 'PUT')).status).toBe(200);
});

it('database guards protect inserts, moves and atomic batches independently of API validation', async () => {
  const root = await category('Root');
  const child = await category('Child', root.id);
  const other = await category('Other');
  await expect(
    env.DB.prepare("INSERT INTO categories(name,slug,parent_id) VALUES('Bad','bad',?)")
      .bind(child.id)
      .run(),
  ).rejects.toThrow('category_depth_limit');
  await expect(
    env.DB.prepare('UPDATE categories SET parent_id=? WHERE id=?').bind(other.id, root.id).run(),
  ).rejects.toThrow('category_depth_limit');
  await expect(
    env.DB.batch([
      env.DB.prepare("UPDATE categories SET name='Changed' WHERE id=?").bind(other.id),
      env.DB.prepare('UPDATE categories SET parent_id=? WHERE id=?').bind(child.id, other.id),
    ]),
  ).rejects.toThrow('category_depth_limit');
  expect(
    await env.DB.prepare('SELECT name FROM categories WHERE id=?').bind(other.id).first('name'),
  ).toBe('Other');
});

it('upgrades three/four-level legacy trees, preserving identity, associations, order and effective privacy', async () => {
  await legacyTree();
  await env.DB.batch(migration().queries.map((query) => env.DB.prepare(query)));
  const { results } = await env.DB.prepare(
    'SELECT id,parent_id,visibility,sort_order,slug FROM categories ORDER BY id',
  ).all();
  expect(results.find((row) => row.id === 103)).toMatchObject({
    parent_id: 101,
    visibility: 'private',
    sort_order: 9,
    slug: 'deep',
  });
  expect(results.find((row) => row.id === 104)).toMatchObject({
    parent_id: 101,
    visibility: 'private',
    sort_order: 10,
  });
  expect(results.find((row) => row.id === 108)).toMatchObject({
    parent_id: 106,
    visibility: 'public',
  });
  expect(
    await env.DB.prepare('SELECT category_id FROM bookmarks WHERE id=101').first('category_id'),
  ).toBe(104);
  const publicPage = await (
    await exports.default.fetch('https://example.com/api/v1/bookmarks?offset=0')
  ).json<{ total: number }>();
  expect(publicPage.total).toBe(0);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM bookmarks_fts WHERE bookmarks_fts MATCH 'Kept'",
    ).first('n'),
  ).toBe(1);
});

it('refuses cyclic legacy trees without partially promoting or installing helper tables', async () => {
  await legacyTree();
  await env.DB.prepare('UPDATE categories SET parent_id=104 WHERE id=101').run();
  await expect(
    env.DB.batch(migration().queries.map((query) => env.DB.prepare(query))),
  ).rejects.toThrow('category_hierarchy_invalid');
  expect(
    await env.DB.prepare('SELECT parent_id FROM categories WHERE id=103').first('parent_id'),
  ).toBe(102);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '_category_depth_%'",
    ).first('n'),
  ).toBe(0);
});

it('normalizes unordered deep JSON imports before writing, retains inherited privacy and reports only new promotions', async () => {
  const data = {
    version: 2,
    categories: [
      { name: 'Deepest', slug: 'deepest', parentSlug: 'deep', visibility: 'public' },
      { name: 'Deep', slug: 'deep', parentSlug: 'hidden', visibility: 'public' },
      { name: 'Hidden', slug: 'hidden', parentSlug: 'root', visibility: 'private' },
      { name: 'Root', slug: 'root', visibility: 'public' },
    ],
    bookmarks: [
      {
        title: 'Private',
        url: 'https://private.example.com',
        categorySlug: 'deepest',
        visibility: 'public',
      },
    ],
  };
  const response = await write('/transfer/import?format=json', data);
  expect(response.status).toBe(200);
  expect(await response.json<ImportSummary>()).toMatchObject({
    categoriesFlattened: 2,
    bookmarksCreated: 1,
    errors: [],
  });
  const rows = await (
    await exports.default.fetch('https://example.com/api/v1/categories', { headers })
  ).json<Category[]>();
  const root = rows.find((row) => row.slug === 'root')!;
  for (const slug of ['deep', 'deepest'])
    expect(rows.find((row) => row.slug === slug)).toMatchObject({
      parentId: root.id,
      visibility: 'private',
    });
  const repeated = await write('/transfer/import?format=json', data);
  expect(await repeated.json<ImportSummary>()).toMatchObject({
    categoriesFlattened: 0,
    bookmarksSkipped: 1,
  });
});

it('normalizes nested HTML folders and reports the count without losing bookmark classification', async () => {
  const body =
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n<DT><H3>Root</H3>\n<DL><p>\n<DT><H3>Child</H3>\n<DL><p>\n<DT><H3>Deep</H3>\n<DL><p>\n<DT><A HREF="https://html-depth.example.com">HTML</A>\n</DL><p>\n</DL><p>\n</DL><p>\n</DL><p>';
  const response = await exports.default.fetch(
    'https://example.com/api/v1/transfer/import?format=html',
    { method: 'POST', headers, body },
  );
  expect(response.status).toBe(200);
  expect(await response.json<ImportSummary>()).toMatchObject({
    categoriesFlattened: 1,
    bookmarksCreated: 1,
  });
  const { results } = await env.DB.prepare(
    "SELECT c.slug, p.slug AS parent FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.slug='deep'",
  ).all();
  expect(results[0]).toMatchObject({ slug: 'deep', parent: 'root' });
});

it('normalizes against existing parent privacy, retaining existing hierarchy and permissions', async () => {
  const root = await category('ExistingRoot');
  const parent = await category('ExistingParent', root.id);
  await write(`/categories/${parent.id}`, { visibility: 'private' }, 'PUT');
  const response = await write('/transfer/import?format=json', {
    version: 2,
    categories: [
      { name: 'ExistingParent', slug: parent.slug, visibility: 'public' },
      { name: 'Promoted', slug: 'promoted', parentSlug: parent.slug, visibility: 'public' },
    ],
    bookmarks: [],
  });
  expect(response.status).toBe(200);
  expect(await response.json<ImportSummary>()).toMatchObject({
    categoriesFlattened: 1,
    errors: [],
  });
  const { results } = await env.DB.prepare(
    'SELECT slug,parent_id,visibility FROM categories',
  ).all();
  expect(results.find((row) => row.slug === parent.slug)).toMatchObject({
    parent_id: root.id,
    visibility: 'private',
  });
  expect(results.find((row) => row.slug === 'promoted')).toMatchObject({
    parent_id: root.id,
    visibility: 'private',
  });
});

it('maps a database depth conflict during a write to a validation response', async () => {
  await env.DB.prepare(
    "CREATE TRIGGER concurrent_category_change BEFORE INSERT ON categories WHEN NEW.slug='race' BEGIN SELECT RAISE(ABORT, 'category_depth_limit'); END",
  ).run();
  try {
    const response = await write('/categories', { name: 'Race' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'validation_error', message: expect.stringContaining('2 层') },
    });
  } finally {
    await env.DB.prepare('DROP TRIGGER concurrent_category_change').run();
  }
});
