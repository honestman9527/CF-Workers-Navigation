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

  it('does not keep categories, manual sorting, or public visibility columns', async () => {
    const columns = await env.DB.prepare(`PRAGMA table_info(bookmarks)`).all<{ name: string }>();
    expect(columns.results.some((column) => column.name === 'category_id')).toBe(false);
    expect(columns.results.some((column) => column.name === 'sort_order')).toBe(false);
    expect(columns.results.some((column) => column.name === 'is_public')).toBe(false);

    const categories = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'categories'`,
    ).all<{ name: string }>();
    expect(categories.results).toEqual([]);
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
