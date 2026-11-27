import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('database schema', () => {
  it('creates the reduced bookmark and tag schema with query indexes', async () => {
    const result = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN (?, ?, ?, ?, ?, ?) ORDER BY name`,
    )
      .bind(
        'bookmarks_category_status_created_idx',
        'bookmarks_category_status_sort_idx',
        'bookmarks_category_url_normalized_idx',
        'bookmarks_status_created_idx',
        'bookmarks_uncategorized_url_normalized_idx',
        'bookmarks_url_normalized_deleted_idx',
      )
      .all<{ name: string }>();

    expect(result.results.map((row) => row.name)).toEqual([
      'bookmarks_category_status_created_idx',
      'bookmarks_category_status_sort_idx',
      'bookmarks_category_url_normalized_idx',
      'bookmarks_status_created_idx',
      'bookmarks_uncategorized_url_normalized_idx',
      'bookmarks_url_normalized_deleted_idx',
    ]);
  });

  it('keeps categories and bookmarks with lookup, visibility, and sorting columns', async () => {
    const columns = await env.DB.prepare(`PRAGMA table_info(bookmarks)`).all<{ name: string }>();
    expect(columns.results.some((column) => column.name === 'category_id')).toBe(true);
    expect(columns.results.some((column) => column.name === 'sort_order')).toBe(true);
    expect(columns.results.some((column) => column.name === 'visibility')).toBe(true);

    const categoryColumns = await env.DB.prepare(`PRAGMA table_info(categories)`).all<{
      name: string;
    }>();
    expect(categoryColumns.results.some((column) => column.name === 'system_key')).toBe(true);

    const categoriesTable = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'categories'`,
    ).all<{ name: string }>();
    expect(categoriesTable.results).toEqual([{ name: 'categories' }]);

    const categoryIndex = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN (?, ?, ?) ORDER BY name`,
    )
      .bind('categories_parent_sort_idx', 'categories_slug_idx', 'categories_system_key_idx')
      .all<{ name: string }>();
    expect(categoryIndex.results.map((row) => row.name)).toEqual([
      'categories_parent_sort_idx',
      'categories_slug_idx',
      'categories_system_key_idx',
    ]);
  });

  it('installs the FTS and system category protection triggers and seeds the common category', async () => {
    const objects = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE name IN (?, ?, ?, ?, ?, ?, ?) ORDER BY name`,
    )
      .bind(
        'bookmarks_fts',
        'bookmarks_fts_delete',
        'bookmarks_fts_insert',
        'bookmarks_fts_update',
        'categories_system_delete',
        'categories_system_insert',
        'categories_system_update',
      )
      .all<{ name: string }>();

    expect(objects.results.map((row) => row.name)).toEqual([
      'bookmarks_fts',
      'bookmarks_fts_delete',
      'bookmarks_fts_insert',
      'bookmarks_fts_update',
      'categories_system_delete',
      'categories_system_insert',
      'categories_system_update',
    ]);

    const common = await env.DB.prepare(
      `SELECT name, slug, icon, parent_id, visibility, system_key FROM categories WHERE system_key = 'common'`,
    ).first<{
      name: string;
      slug: string;
      icon: string | null;
      parent_id: number | null;
      visibility: string;
      system_key: string | null;
    }>();
    expect(common).toEqual({
      name: '常用',
      slug: 'common',
      icon: 'Star',
      parent_id: null,
      visibility: 'public',
      system_key: 'common',
    });
  });
});
