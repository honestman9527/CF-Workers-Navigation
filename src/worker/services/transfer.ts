import type {
  ImportStrategy,
  ImportSummary,
  TransferBookmark,
  TransferData,
} from '../transfer/types';
import type { Bindings } from '../types';

import { eq } from 'drizzle-orm';

import { getDb } from '../db';
import { bookmarks, type NewBookmark } from '../schema';
import { ensureDefaultCategory, normalizeUrl, replaceTags } from './bookmarks';
import { listBookmarks } from './bookmarks';

const BOOKMARK_INSERT_CHUNK_SIZE = 12;
const BOOKMARK_UPDATE_BATCH_SIZE = 25;

type Db = ReturnType<typeof getDb>;

type ImportIndex = {
  bookmarkUrls: Set<string>;
};

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

function toTransferBookmark(
  bookmark: Awaited<ReturnType<typeof listBookmarks>>[number],
): TransferBookmark {
  return {
    title: bookmark.title,
    url: bookmark.url,
    description: bookmark.description,
    iconUrl: bookmark.iconUrl,
    isPinned: bookmark.isPinned,
    tags: bookmark.tags,
    archivedAt: bookmark.archivedAt,
    deletedAt: bookmark.deletedAt,
    sortOrder: bookmark.sortOrder,
    addedAt: bookmark.createdAt,
  };
}

export async function exportTransferData(env: Bindings): Promise<TransferData> {
  const rows = await listBookmarks(env, { view: 'all' });
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks: rows.map(toTransferBookmark),
  };
}

async function loadImportIndex(db: Db): Promise<ImportIndex> {
  const rows = await db
    .select({ urlNormalized: bookmarks.urlNormalized, url: bookmarks.url })
    .from(bookmarks);
  const bookmarkUrls = new Set<string>();
  for (const row of rows) bookmarkUrls.add(row.urlNormalized || normalizeUrl(row.url));
  return { bookmarkUrls };
}

function toBookmarkValues(bookmark: TransferBookmark, categoryId: number): NewBookmark {
  return {
    categoryId,
    title: bookmark.title,
    url: bookmark.url,
    description: bookmark.description ?? null,
    iconUrl: bookmark.iconUrl ?? null,
    isPinned: bookmark.isPinned ?? false,
    archivedAt: bookmark.archivedAt ?? null,
    deletedAt: bookmark.deletedAt ?? null,
    sortOrder: bookmark.sortOrder ?? 0,
    urlNormalized: normalizeUrl(bookmark.url),
  };
}

async function importBookmarks(
  env: Bindings,
  db: Db,
  index: ImportIndex,
  transferBookmarks: TransferBookmark[],
  categoryId: number,
  strategy: ImportStrategy,
  summary: ImportSummary,
): Promise<void> {
  const inserts: TransferBookmark[] = [];
  const updates: TransferBookmark[] = [];

  for (const bookmark of transferBookmarks) {
    const normalized = normalizeUrl(bookmark.url);
    const exists = index.bookmarkUrls.has(normalized);
    if (exists) {
      if (strategy === 'skip') {
        summary.bookmarksSkipped += 1;
      } else if (strategy === 'update') {
        updates.push(bookmark);
        summary.bookmarksUpdated += 1;
      } else {
        inserts.push(bookmark);
        index.bookmarkUrls.add(normalized);
        summary.bookmarksCreated += 1;
      }
      continue;
    }
    inserts.push(bookmark);
    index.bookmarkUrls.add(normalized);
    summary.bookmarksCreated += 1;
  }

  for (const chunk of chunks(inserts, BOOKMARK_INSERT_CHUNK_SIZE)) {
    const created = await db
      .insert(bookmarks)
      .values(chunk.map((bookmark) => toBookmarkValues(bookmark, categoryId)))
      .returning({ id: bookmarks.id });
    for (let index = 0; index < created.length; index += 1) {
      await replaceTags(env, created[index].id, chunk[index].tags);
    }
  }

  for (const chunk of chunks(updates, BOOKMARK_UPDATE_BATCH_SIZE)) {
    const statements = chunk.map((bookmark) =>
      db
        .update(bookmarks)
        .set({
          title: bookmark.title,
          description: bookmark.description ?? null,
          iconUrl: bookmark.iconUrl ?? null,
          isPinned: bookmark.isPinned ?? false,
          archivedAt: bookmark.archivedAt ?? null,
          deletedAt: bookmark.deletedAt ?? null,
          sortOrder: bookmark.sortOrder ?? 0,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(bookmarks.urlNormalized, normalizeUrl(bookmark.url))),
    );
    await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
    for (const bookmark of chunk) {
      const [row] = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(eq(bookmarks.urlNormalized, normalizeUrl(bookmark.url)));
      if (row) await replaceTags(env, row.id, bookmark.tags);
    }
  }
}

export async function importTransferData(
  env: Bindings,
  data: TransferData,
  strategy: ImportStrategy,
): Promise<ImportSummary> {
  const db = getDb(env);
  const summary: ImportSummary = {
    bookmarksCreated: 0,
    bookmarksSkipped: 0,
    bookmarksUpdated: 0,
    errors: [],
  };
  const index = await loadImportIndex(db);
  if (data.bookmarks.length > 0) {
    const categoryId = await ensureDefaultCategory(env);
    await importBookmarks(env, db, index, data.bookmarks, categoryId, strategy, summary);
  }
  return summary;
}
