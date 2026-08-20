import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('database schema', () => {
  it('creates the reduced bookmark and tag schema with query indexes', async () => {
    const result = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN (?, ?, ?) ORDER BY name`,
    )
      .bind(
        'bookmarks_pinned_created_idx',
        'bookmarks_status_created_idx',
        'bookmarks_url_normalized_idx',
      )
      .all<{ name: string }>();

    expect(result.results.map((row) => row.name)).toEqual([
      'bookmarks_pinned_created_idx',
      'bookmarks_status_created_idx',
      'bookmarks_url_normalized_idx',
    ]);
  });

  it('keeps categories with bookmark lookup columns but no manual sorting or visibility', async () => {
    const columns = await env.DB.prepare(`PRAGMA table_info(bookmarks)`).all<{ name: string }>();
    expect(columns.results.some((column) => column.name === 'category_id')).toBe(true);
    expect(columns.results.some((column) => column.name === 'sort_order')).toBe(false);
    expect(columns.results.some((column) => column.name === 'is_public')).toBe(false);

    const categoriesTable = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'categories'`,
    ).all<{ name: string }>();
    expect(categoriesTable.results).toEqual([{ name: 'categories' }]);

    const categoryIndex = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN (?, ?) ORDER BY name`,
    )
      .bind('categories_slug_idx', 'categories_parent_sort_idx')
      .all<{ name: string }>();
    expect(categoryIndex.results.map((row) => row.name)).toEqual([
      'categories_parent_sort_idx',
      'categories_slug_idx',
    ]);
  });

  it('installs the FTS table and content synchronization triggers', async () => {
    const objects = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE name IN (?, ?, ?, ?) ORDER BY name`,
    )
      .bind('bookmarks_fts', 'bookmarks_fts_delete', 'bookmarks_fts_insert', 'bookmarks_fts_update')
      .all<{ name: string }>();

    expect(objects.results.map((row) => row.name)).toEqual([
      'bookmarks_fts',
      'bookmarks_fts_delete',
      'bookmarks_fts_insert',
      'bookmarks_fts_update',
    ]);
  });
});
