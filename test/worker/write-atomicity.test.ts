import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { beforeEach, expect, it } from 'vitest';

import { createBookmark, getBookmark, updateBookmark } from '../../src/worker/services/bookmarks';
import { deleteTag, mergeTag } from '../../src/worker/services/tags';

const db = drizzle(env.DB);

beforeEach(async () => {
  await env.DB.prepare('DROP TRIGGER IF EXISTS fail_write').run();
  await env.DB.batch(
    ['bookmark_tags', 'bookmarks', 'tags'].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
});

async function failBefore(table: string, event: 'INSERT' | 'DELETE') {
  await env.DB.prepare(
    `CREATE TRIGGER fail_write BEFORE ${event} ON ${table}
     BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`,
  ).run();
}

it('rolls back a new bookmark, new tags and its FTS entry when relation insertion fails', async () => {
  await failBefore('bookmark_tags', 'INSERT');
  await expect(
    createBookmark(db, {
      title: 'AtomicCreate',
      url: 'https://atomic-create.example.com',
      tags: ['NewTag'],
    }),
  ).rejects.toThrow();
  for (const table of ['bookmarks', 'tags', 'bookmark_tags', 'bookmarks_fts']) {
    expect(await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first('count')).toBe(0);
  }
  await env.DB.prepare('DROP TRIGGER fail_write').run();
  expect(
    (
      await createBookmark(db, {
        title: 'AtomicCreate',
        url: 'https://atomic-create.example.com',
        tags: ['NewTag'],
      })
    ).tags,
  ).toEqual(['NewTag']);
});

it('rolls back edited fields, removed associations, new tags and FTS changes', async () => {
  const original = await createBookmark(db, {
    title: 'OriginalAtomicTitle',
    url: 'https://atomic-edit.example.com',
    tags: ['OriginalTag'],
  });
  await failBefore('bookmark_tags', 'INSERT');
  await expect(
    updateBookmark(db, original.id, { title: 'ChangedAtomicTitle', tags: ['NewTag'] }),
  ).rejects.toThrow();
  expect(await getBookmark(db, original.id, true)).toEqual(original);
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS count FROM tags WHERE slug = 'newtag'").first('count'),
  ).toBe(0);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM bookmarks_fts WHERE bookmarks_fts MATCH 'ChangedAtomicTitle'",
    ).first('count'),
  ).toBe(0);
});

it.each(['merge', 'delete'] as const)(
  'rolls back tag %s when deleting the tag fails',
  async (operation) => {
    const bookmark = await createBookmark(db, {
      title: 'Tagged',
      url: 'https://atomic-tag.example.com',
      tags: ['Source', 'Target'],
    });
    const rows = await env.DB.prepare('SELECT id, slug FROM tags').all<{
      id: number;
      slug: string;
    }>();
    const source = rows.results.find((tag) => tag.slug === 'source')!.id;
    const target = rows.results.find((tag) => tag.slug === 'target')!.id;
    await failBefore('tags', 'DELETE');
    await expect(
      operation === 'merge' ? mergeTag(db, source, target) : deleteTag(db, source),
    ).rejects.toThrow();
    expect((await getBookmark(db, bookmark.id, true)).tags).toEqual(['Source', 'Target']);
  },
);
