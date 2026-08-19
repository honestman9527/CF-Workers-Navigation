import type {
  ImportStrategy,
  ImportSummary,
  TransferBookmark,
  TransferData,
} from '../transfer/types';
import type { Db } from '../types';

import { eq, sql } from 'drizzle-orm';

import { bookmarks } from '../schema';
import { listBookmarks, normalizeUrl, replaceTags } from './bookmarks';

const INSERT_CHUNK_SIZE = 20;
const UPDATE_CHUNK_SIZE = 25;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function exportTransferData(db: Db): Promise<TransferData> {
  const exported: TransferBookmark[] = [];
  let cursor: string | undefined;
  do {
    const page = await listBookmarks(db, { view: 'all', cursor, limit: 100 });
    exported.push(
      ...page.items.map((bookmark) => ({
        title: bookmark.title,
        url: bookmark.url,
        description: bookmark.description,
        iconUrl: bookmark.iconUrl,
        isPinned: bookmark.isPinned,
        tags: bookmark.tags,
        archivedAt: bookmark.archivedAt,
        deletedAt: bookmark.deletedAt,
        addedAt: bookmark.createdAt,
      })),
    );
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { version: 1, exportedAt: new Date().toISOString(), bookmarks: exported };
}

export async function importTransferData(
  db: Db,
  data: TransferData,
  strategy: ImportStrategy,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    bookmarksCreated: 0,
    bookmarksSkipped: 0,
    bookmarksUpdated: 0,
    errors: [],
  };
  const existingRows = await db
    .select({ id: bookmarks.id, urlNormalized: bookmarks.urlNormalized, url: bookmarks.url })
    .from(bookmarks);
  const existing = new Map(
    existingRows.map((row) => [row.urlNormalized || normalizeUrl(row.url), row.id]),
  );
  const inserts: TransferBookmark[] = [];
  const updates: Array<{ id: number; bookmark: TransferBookmark }> = [];

  for (const bookmark of data.bookmarks) {
    const normalized = normalizeUrl(bookmark.url);
    const id = existing.get(normalized);
    if (id !== undefined) {
      if (strategy === 'update') {
        updates.push({ id, bookmark });
        summary.bookmarksUpdated += 1;
      } else {
        summary.bookmarksSkipped += 1;
      }
      continue;
    }
    inserts.push(bookmark);
    existing.set(normalized, -1);
    summary.bookmarksCreated += 1;
  }

  for (const chunk of chunks(inserts, INSERT_CHUNK_SIZE)) {
    const created = await db
      .insert(bookmarks)
      .values(
        chunk.map((bookmark) => ({
          title: bookmark.title,
          url: bookmark.url,
          description: bookmark.description ?? null,
          iconUrl: bookmark.iconUrl ?? null,
          isPinned: bookmark.isPinned ?? false,
          archivedAt: bookmark.archivedAt ?? null,
          deletedAt: bookmark.deletedAt ?? null,
          createdAt: bookmark.addedAt ?? undefined,
          urlNormalized: normalizeUrl(bookmark.url),
        })),
      )
      .returning({ id: bookmarks.id });
    for (let index = 0; index < created.length; index += 1) {
      await replaceTags(db, created[index].id, chunk[index].tags);
    }
  }

  for (const chunk of chunks(updates, UPDATE_CHUNK_SIZE)) {
    const statements = chunk.map(({ id, bookmark }) =>
      db
        .update(bookmarks)
        .set({
          title: bookmark.title,
          description: bookmark.description ?? null,
          iconUrl: bookmark.iconUrl ?? null,
          isPinned: bookmark.isPinned ?? false,
          archivedAt: bookmark.archivedAt ?? null,
          deletedAt: bookmark.deletedAt ?? null,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(bookmarks.id, id)),
    );
    await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
    for (const { id, bookmark } of chunk) await replaceTags(db, id, bookmark.tags);
  }

  return summary;
}
