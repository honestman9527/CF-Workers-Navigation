import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('database schema', () => {
  it('keeps folder and bookmark indexes after dropping public columns', async () => {
    const result = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN (?, ?, ?) ORDER BY name`,
    )
      .bind('bookmarks_category_sort_idx', 'bookmarks_pinned_sort_idx', 'bookmarks_url_idx')
      .all<{ name: string }>();

    expect(result.results.map((row) => row.name)).toEqual([
      'bookmarks_category_sort_idx',
      'bookmarks_pinned_sort_idx',
      'bookmarks_url_idx',
    ]);
  });

  it('does not keep public visibility columns or indexes', async () => {
    const columns = await env.DB.prepare(`PRAGMA table_info(bookmarks)`).all<{ name: string }>();
    expect(columns.results.some((column) => column.name === 'is_public')).toBe(false);

    const indexes = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE type = 'index' AND name LIKE '%public%'`,
    ).all<{ name: string }>();
    expect(indexes.results).toEqual([]);
  });
});
