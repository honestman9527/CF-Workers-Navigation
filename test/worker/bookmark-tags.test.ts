import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { beforeEach, describe, expect, it } from 'vitest';

import { withBookmarkTagWrites } from '../../src/worker/services/bookmark-tags';

async function seedBookmarks(count: number): Promise<number[]> {
  const { results } = await env.DB.prepare(
    `WITH RECURSIVE numbers(n) AS (
      SELECT 1 UNION ALL SELECT n + 1 FROM numbers WHERE n < ?
    )
    INSERT INTO bookmarks (title, url, url_normalized)
    SELECT 'Bookmark ' || n, 'https://tags-' || n || '.example.com',
      'https://tags-' || n || '.example.com' FROM numbers
    RETURNING id`,
  )
    .bind(count)
    .all<{ id: number }>();
  return results.map((row) => row.id);
}

async function readTags(bookmarkId: number): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT t.name FROM tags t
    INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
    WHERE bt.bookmark_id = ? ORDER BY t.name`,
  )
    .bind(bookmarkId)
    .all<{ name: string }>();
  return results.map((row) => row.name);
}

function observeQueries(onQuery?: (query: string) => void) {
  const queries: string[] = [];
  const db = drizzle(env.DB, {
    logger: {
      logQuery(query, params) {
        if (params.length > 100) throw new Error('D1 parameter budget exceeded');
        queries.push(query);
        onQuery?.(query);
      },
    },
  });
  return { db, queries };
}

describe('bookmark tag writes', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM bookmark_tags'),
      env.DB.prepare('DELETE FROM bookmarks'),
      env.DB.prepare('DELETE FROM tags'),
    ]);
  });

  it('retains omitted tags, clears empty tags, and shares normalization and the 30-tag limit', async () => {
    const ids = await seedBookmarks(4);
    const { db } = observeQueries();
    await withBookmarkTagWrites(db, (replace) =>
      replace(ids.map((bookmarkId) => ({ bookmarkId, names: ['Existing'] }))),
    );
    const result = await withBookmarkTagWrites(db, async (replace) => {
      await replace([
        { bookmarkId: ids[0], names: undefined },
        { bookmarkId: ids[1], names: [] },
        {
          bookmarkId: ids[2],
          names: [' Docs ', 'docs', '', '!!!', ...Array.from({ length: 35 }, (_, i) => `Tag ${i}`)],
        },
        { bookmarkId: ids[3], names: ['EXISTING'] },
      ]);
      return 'saved';
    });

    expect(result).toBe('saved');
    expect(await readTags(ids[0])).toEqual(['Existing']);
    expect(await readTags(ids[1])).toEqual([]);
    const normalized = await readTags(ids[2]);
    expect(normalized).toHaveLength(30);
    expect(normalized).toContain('Docs');
    expect(normalized).toContain('Tag 28');
    expect(normalized).not.toContain('Tag 29');
    expect(await readTags(ids[3])).toEqual(['Existing']);
  });

  it('uses the last provided replacement for repeated IDs and the first name for a shared slug', async () => {
    const [first, second] = await seedBookmarks(2);
    const { db } = observeQueries();
    await withBookmarkTagWrites(db, async (replace) => {
      await replace([
        { bookmarkId: first, names: ['Old'] },
        { bookmarkId: second, names: ['Shared'] },
      ]);
      await replace([
        { bookmarkId: first, names: ['SHARED'] },
        { bookmarkId: first, names: undefined },
      ]);
    });
    expect(await readTags(first)).toEqual(['Shared']);
    expect(await readTags(second)).toEqual(['Shared']);
  });

  it('replaces tags for more than 100 bookmarks in one call within every statement budget', async () => {
    const ids = await seedBookmarks(215);
    const { db } = observeQueries();
    const entries = ids.map((bookmarkId) => ({
      bookmarkId,
      names: ['Shared', `Unique ${bookmarkId}`],
    }));
    await withBookmarkTagWrites(db, (replace) => replace(entries));
    await withBookmarkTagWrites(db, (replace) =>
      replace(entries.map((entry) => ({ ...entry, names: ['Replacement'] }))),
    );

    const { results } = await env.DB.prepare(
      `SELECT bt.bookmark_id, t.name FROM bookmark_tags bt
      INNER JOIN tags t ON t.id = bt.tag_id`,
    ).all<{ bookmark_id: number; name: string }>();
    expect(results).toHaveLength(215);
    expect(new Set(results.map((row) => row.bookmark_id))).toEqual(new Set(ids));
    expect(results.every((row) => row.name === 'Replacement')).toBe(true);
  });

  it.each([
    { count: 25, batchSize: 9, queryBudget: 4 },
    { count: 100, batchSize: 25, queryBudget: 6 },
  ])(
    'aggregates $count replacements across $batchSize-bookmark batches',
    async ({ count, batchSize, queryBudget }) => {
      const ids = await seedBookmarks(count);
      const { db, queries } = observeQueries();
      await withBookmarkTagWrites(db, async (replace) => {
        for (let index = 0; index < ids.length; index += batchSize) {
          await replace(
            ids
              .slice(index, index + batchSize)
              .map((bookmarkId) => ({ bookmarkId, names: ['Shared'] })),
          );
        }
      });
      expect(queries.length).toBeLessThanOrEqual(queryBudget);
      expect(
        await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmark_tags').first('count'),
      ).toBe(count);
    },
  );

  it('drains pending tags for committed bookmarks before propagating an operation failure', async () => {
    const [bookmarkId] = await seedBookmarks(1);
    const { db } = observeQueries();
    const failure = new Error('Next bookmark batch failed');
    await expect(
      withBookmarkTagWrites(db, async (replace) => {
        await replace([{ bookmarkId, names: ['Committed'] }]);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await readTags(bookmarkId)).toEqual(['Committed']);
  });

  it.each(['cleanup', 'buffer-full'] as const)(
    'propagates a tag failure during %s without retrying',
    async (phase) => {
      const ids = await seedBookmarks(101);
      const failure = new Error('Tag insert failed');
      let attempts = 0;
      const { db } = observeQueries((query) => {
        if (query.startsWith('insert into "tags"')) {
          attempts += 1;
          throw failure;
        }
      });
      await expect(
        withBookmarkTagWrites(db, async (replace) => {
          await replace(
            ids.slice(0, 100).map((bookmarkId) => ({ bookmarkId, names: ['Pending'] })),
          );
          if (phase === 'buffer-full') await replace([{ bookmarkId: ids[100], names: ['Next'] }]);
        }),
      ).rejects.toBe(failure);
      expect(attempts).toBe(1);
      expect(
        await env.DB.prepare('SELECT COUNT(*) AS count FROM bookmark_tags').first('count'),
      ).toBe(0);
    },
  );

  it('preserves both the operation and cleanup failures', async () => {
    const [bookmarkId] = await seedBookmarks(1);
    const operationError = new Error('Bookmark insert failed');
    const tagError = new Error('Tag insert failed');
    const { db } = observeQueries((query) => {
      if (query.startsWith('insert into "tags"')) throw tagError;
    });
    const promise = withBookmarkTagWrites(db, async (replace) => {
      await replace([{ bookmarkId, names: ['Pending'] }]);
      throw operationError;
    });
    await expect(promise).rejects.toBeInstanceOf(AggregateError);
    await expect(promise).rejects.toMatchObject({
      errors: [operationError, tagError],
      cause: operationError,
    });
  });
});
