import type { Bookmark as BookmarkDto } from '../../shared/api/types';
import type { Bindings } from '../types';

import { eq, inArray, sql } from 'drizzle-orm';

import { getDb } from '../db';
import { bookmarks, type Bookmark, type NewBookmark } from '../schema';
import { categoryExists } from './categories';
import { ServiceError } from './errors';

type BookmarkRow = {
  id: number;
  category_id: number;
  title: string;
  url: string;
  description: string | null;
  icon_url: string | null;
  is_pinned: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function toBookmarkDto(row: Bookmark): BookmarkDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    title: row.title,
    url: row.url,
    description: row.description,
    iconUrl: row.iconUrl,
    isPinned: row.isPinned,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function fromSqlRow(row: BookmarkRow): BookmarkDto {
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    url: row.url,
    description: row.description,
    iconUrl: row.icon_url,
    isPinned: Boolean(row.is_pinned),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type BookmarkWrite = {
  categoryId: number;
  title: string;
  url: string;
  description?: string | null;
  iconUrl?: string | null;
  isPinned?: boolean;
  sortOrder?: number;
};

function toInsertValues(input: BookmarkWrite): NewBookmark {
  return {
    categoryId: input.categoryId,
    title: input.title,
    url: input.url,
    description: input.description,
    iconUrl: input.iconUrl,
    isPinned: input.isPinned,
    sortOrder: input.sortOrder,
  };
}

export async function listBookmarks(
  env: Bindings,
  options: { categoryId?: number; includeChildren?: boolean },
): Promise<BookmarkDto[]> {
  const db = getDb(env);

  if (options.categoryId !== undefined && options.includeChildren) {
    const rows = await db.all<BookmarkRow>(sql`
      WITH RECURSIVE subtree(id) AS (
        SELECT id FROM categories WHERE id = ${options.categoryId}
        UNION ALL
        SELECT categories.id FROM categories JOIN subtree ON categories.parent_id = subtree.id
      )
      SELECT bookmarks.id, bookmarks.category_id, bookmarks.title, bookmarks.url, bookmarks.description,
        bookmarks.icon_url, bookmarks.is_pinned, bookmarks.sort_order, bookmarks.created_at, bookmarks.updated_at
      FROM bookmarks
      JOIN subtree ON bookmarks.category_id = subtree.id
      ORDER BY bookmarks.sort_order, bookmarks.id
    `);
    return rows.map(fromSqlRow);
  }

  if (options.categoryId !== undefined) {
    const rows = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.categoryId, options.categoryId))
      .orderBy(bookmarks.sortOrder, bookmarks.id);
    return rows.map(toBookmarkDto);
  }

  const rows = await db.select().from(bookmarks).orderBy(bookmarks.sortOrder, bookmarks.id);
  return rows.map(toBookmarkDto);
}

export async function getBookmark(env: Bindings, id: number): Promise<BookmarkDto> {
  const db = getDb(env);
  const [bookmark] = await db.select().from(bookmarks).where(eq(bookmarks.id, id));
  if (bookmark === undefined) {
    throw new ServiceError(404, 'not_found', 'Bookmark not found');
  }
  return toBookmarkDto(bookmark);
}

export async function listPinnedBookmarks(env: Bindings): Promise<BookmarkDto[]> {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.isPinned, true))
    .orderBy(bookmarks.sortOrder, bookmarks.id);
  return rows.map(toBookmarkDto);
}

function buildFtsQuery(raw: string): string {
  const tokens = raw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return '';
  }

  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' OR ');
}

export async function searchBookmarks(env: Bindings, query: string): Promise<BookmarkDto[]> {
  const ftsQuery = buildFtsQuery(query);
  if (ftsQuery.length === 0) {
    return [];
  }

  const db = getDb(env);
  try {
    const rows = await db.all<BookmarkRow>(sql`
      SELECT b.id, b.category_id, b.title, b.url, b.description,
        b.icon_url, b.is_pinned, b.sort_order, b.created_at, b.updated_at
      FROM bookmarks b
      JOIN bookmarks_fts ON b.id = bookmarks_fts.rowid
      WHERE bookmarks_fts MATCH ${ftsQuery}
      ORDER BY rank
      LIMIT 100
    `);
    return rows.map(fromSqlRow);
  } catch {
    return [];
  }
}

export async function createBookmark(env: Bindings, input: BookmarkWrite): Promise<BookmarkDto> {
  if (!(await categoryExists(env, input.categoryId))) {
    throw new ServiceError(404, 'not_found', 'Category not found');
  }

  const db = getDb(env);
  const [bookmark] = await db.insert(bookmarks).values(toInsertValues(input)).returning();
  return toBookmarkDto(bookmark);
}

export async function updateBookmark(
  env: Bindings,
  id: number,
  input: Partial<BookmarkWrite>,
): Promise<BookmarkDto> {
  const db = getDb(env);
  const [current] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.id, id));
  if (current === undefined) {
    throw new ServiceError(404, 'not_found', 'Bookmark not found');
  }

  if (input.categoryId !== undefined && !(await categoryExists(env, input.categoryId))) {
    throw new ServiceError(404, 'not_found', 'Category not found');
  }

  const [bookmark] = await db
    .update(bookmarks)
    .set({
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl } : {}),
      ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(bookmarks.id, id))
    .returning();

  return toBookmarkDto(bookmark);
}

export async function deleteBookmark(env: Bindings, id: number): Promise<void> {
  const db = getDb(env);
  const deleted = await db
    .delete(bookmarks)
    .where(eq(bookmarks.id, id))
    .returning({ id: bookmarks.id });
  if (deleted.length === 0) {
    throw new ServiceError(404, 'not_found', 'Bookmark not found');
  }
}

export async function reorderBookmarks(
  env: Bindings,
  items: Array<{ id: number; sortOrder: number }>,
): Promise<void> {
  const db = getDb(env);
  const ids = items.map((item) => item.id);
  const existing = await db
    .select({ id: bookmarks.id, categoryId: bookmarks.categoryId })
    .from(bookmarks)
    .where(inArray(bookmarks.id, ids));

  if (existing.length !== ids.length) {
    throw new ServiceError(404, 'not_found', 'Bookmark not found');
  }

  const [first] = existing;
  if (existing.some((bookmark) => bookmark.categoryId !== first.categoryId)) {
    throw new ServiceError(400, 'validation_error', 'Bookmarks must share the same category');
  }

  const updates = items.map((item) =>
    db
      .update(bookmarks)
      .set({ sortOrder: item.sortOrder, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(bookmarks.id, item.id)),
  );
  await db.batch(updates as [(typeof updates)[number], ...typeof updates]);
}
