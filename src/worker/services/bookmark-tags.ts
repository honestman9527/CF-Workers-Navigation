import type { Db } from '../types';

import { inArray } from 'drizzle-orm';

import { bookmarkTags, tags } from '../schema';
import { slugify } from '../slug';

// D1 allows 100 bound parameters per statement. Tag and relation inserts bind
// two values per row; retain headroom and the existing cross-batch grouping.
const BOOKMARK_BATCH_SIZE = 100;
const TAG_ROWS_PER_STATEMENT = 40;

type BookmarkTagWrite = { bookmarkId: number; names: readonly string[] | undefined };
type ReplaceBookmarkTags = (entries: readonly BookmarkTagWrite[]) => Promise<void>;

function cleanTagNames(names: readonly string[]): Array<{ name: string; slug: string }> {
  const unique = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    const slug = slugify(name);
    if (name && slug && !unique.has(slug)) unique.set(slug, name);
  }
  return [...unique].slice(0, 30).map(([slug, name]) => ({ slug, name }));
}

async function writeTags(db: Db, entries: readonly BookmarkTagWrite[]) {
  const cleaned = new Map<number, ReturnType<typeof cleanTagNames>>();
  const uniqueTags = new Map<string, string>();
  for (const { bookmarkId, names } of entries) {
    if (names === undefined) continue;
    const tagsForBookmark = cleanTagNames(names);
    cleaned.set(bookmarkId, tagsForBookmark);
    for (const tag of tagsForBookmark) {
      if (!uniqueTags.has(tag.slug)) uniqueTags.set(tag.slug, tag.name);
    }
  }
  if (cleaned.size === 0) return;

  await db.delete(bookmarkTags).where(inArray(bookmarkTags.bookmarkId, [...cleaned.keys()]));
  if (uniqueTags.size === 0) return;

  const tagEntries = [...uniqueTags].map(([slug, name]) => ({ slug, name }));
  const tagIds = new Map<string, number>();
  for (let index = 0; index < tagEntries.length; index += TAG_ROWS_PER_STATEMENT) {
    const chunk = tagEntries.slice(index, index + TAG_ROWS_PER_STATEMENT);
    await db.insert(tags).values(chunk).onConflictDoNothing({ target: tags.slug });
    const resolved = await db
      .select({ id: tags.id, slug: tags.slug })
      .from(tags)
      .where(
        inArray(
          tags.slug,
          chunk.map((tag) => tag.slug),
        ),
      );
    for (const tag of resolved) tagIds.set(tag.slug, tag.id);
  }

  const links = [...cleaned].flatMap(([bookmarkId, tagNames]) =>
    tagNames.flatMap(({ slug }) => {
      const tagId = tagIds.get(slug);
      return tagId === undefined ? [] : [{ bookmarkId, tagId }];
    }),
  );
  for (let index = 0; index < links.length; index += TAG_ROWS_PER_STATEMENT) {
    await db
      .insert(bookmarkTags)
      .values(links.slice(index, index + TAG_ROWS_PER_STATEMENT))
      .onConflictDoNothing();
  }
}

/**
 * Queue replacements for committed bookmarks, awaiting each call. Undefined
 * names retain existing relations; an empty list clears them. Writes are
 * buffered within this scope and drained on success or failure, without retry.
 * Neither the scope nor a replacement is an atomic transaction.
 */
export async function withBookmarkTagWrites<T>(
  db: Db,
  operation: (replace: ReplaceBookmarkTags) => Promise<T>,
): Promise<T> {
  let pending: BookmarkTagWrite[] = [];
  async function flush() {
    if (pending.length === 0) return;
    const entries = pending;
    // A partially failed replacement must not be retried during scope cleanup.
    pending = [];
    await writeTags(db, entries);
  }
  const replace: ReplaceBookmarkTags = async (entries) => {
    if (pending.length + entries.length > BOOKMARK_BATCH_SIZE) await flush();
    for (let index = 0; index < entries.length; index += BOOKMARK_BATCH_SIZE) {
      if (pending.length === BOOKMARK_BATCH_SIZE) await flush();
      pending.push(...entries.slice(index, index + BOOKMARK_BATCH_SIZE));
    }
  };

  let result: T;
  try {
    result = await operation(replace);
  } catch (operationError) {
    try {
      await flush();
    } catch (flushError) {
      throw new AggregateError(
        [operationError, flushError],
        'Bookmark write and tag cleanup both failed',
        { cause: operationError },
      );
    }
    throw operationError;
  }
  await flush();
  return result;
}
