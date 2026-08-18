import type { Bookmark as BookmarkDto, Tag as TagDto } from '../../shared/api/types';
import type { Bindings } from '../types';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb } from '../db';
import {
  bookmarkTags,
  bookmarks,
  categories,
  tags,
  type Bookmark,
  type NewBookmark,
} from '../schema';
import { categoryExists } from './categories';
import { ServiceError } from './errors';

type BookmarkView = 'active' | 'archive' | 'trash' | 'all';
type BookmarkRow = {
  id: number;
  category_id: number | null;
  title: string;
  url: string;
  description: string | null;
  icon_url: string | null;
  is_pinned: number;
  archived_at: string | null;
  deleted_at: string | null;
  url_normalized: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// D1 limits the number of bound variables in a prepared statement. Keep tag
// lookups below that limit when the workspace contains a large bookmark set.
const TAG_LOOKUP_BATCH_SIZE = 50;

export function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw.trim());
    parsed.hash = '';
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return raw.trim().toLowerCase().replace(/\/$/, '');
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '');
}

function toBookmarkDto(row: Bookmark, tagNames: string[] = []): BookmarkDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    title: row.title,
    url: row.url,
    description: row.description,
    iconUrl: row.iconUrl,
    isPinned: row.isPinned,
    tags: tagNames,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    urlNormalized: row.urlNormalized,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function fromRaw(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    url: row.url,
    description: row.description,
    iconUrl: row.icon_url,
    isPinned: Boolean(row.is_pinned),
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    urlNormalized: row.url_normalized,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type BookmarkWrite = {
  categoryId?: number | null;
  title: string;
  url: string;
  description?: string | null;
  iconUrl?: string | null;
  isPinned?: boolean;
  sortOrder?: number;
  tags?: string[];
};

async function withTags(env: Bindings, rows: Bookmark[]): Promise<BookmarkDto[]> {
  if (rows.length === 0) return [];
  const db = getDb(env);
  const links: Array<{ bookmarkId: number; name: string }> = [];
  const bookmarkIds = rows.map((row) => row.id);
  for (let offset = 0; offset < bookmarkIds.length; offset += TAG_LOOKUP_BATCH_SIZE) {
    const batch = bookmarkIds.slice(offset, offset + TAG_LOOKUP_BATCH_SIZE);
    const batchLinks = await db
      .select({ bookmarkId: bookmarkTags.bookmarkId, name: tags.name })
      .from(bookmarkTags)
      .innerJoin(tags, eq(bookmarkTags.tagId, tags.id))
      .where(inArray(bookmarkTags.bookmarkId, batch));
    links.push(...batchLinks);
  }
  const byBookmark = new Map<number, string[]>();
  for (const link of links)
    byBookmark.set(link.bookmarkId, [...(byBookmark.get(link.bookmarkId) ?? []), link.name]);
  return rows.map((row) => toBookmarkDto(row, byBookmark.get(row.id) ?? []));
}

async function replaceTags(env: Bindings, bookmarkId: number, names: string[] | undefined) {
  if (names === undefined) return;
  const db = getDb(env);
  const cleanBySlug = new Map<string, string>();
  for (const rawName of names) {
    const name = rawName.trim();
    const slug = slugify(name);
    if (name && slug && !cleanBySlug.has(slug)) cleanBySlug.set(slug, name);
  }
  const clean = [...cleanBySlug].slice(0, 30).map(([slug, name]) => ({ name, slug }));

  await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, bookmarkId));
  if (clean.length === 0) return;

  const slugs = clean.map((tag) => tag.slug);
  const existing = await db.select({ slug: tags.slug }).from(tags).where(inArray(tags.slug, slugs));
  const existingSlugs = new Set(existing.map((tag) => tag.slug));
  const missing = clean.filter((tag) => !existingSlugs.has(tag.slug));
  if (missing.length > 0) {
    await db.insert(tags).values(missing).onConflictDoNothing({ target: tags.slug });
  }

  const resolved = await db.select({ id: tags.id }).from(tags).where(inArray(tags.slug, slugs));
  if (resolved.length > 0) {
    await db
      .insert(bookmarkTags)
      .values(resolved.map((tag) => ({ bookmarkId, tagId: tag.id })))
      .onConflictDoNothing();
  }
}

async function ensureDefaultCategory(env: Bindings): Promise<number> {
  const db = getDb(env);
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, 'all-bookmarks'));
  if (existing) return existing.id;
  const [created] = await db
    .insert(categories)
    .values({ name: '所有书签', slug: 'all-bookmarks' })
    .returning({ id: categories.id });
  return created.id;
}

async function assertNotDuplicate(env: Bindings, url: string, excludeId?: number) {
  const db = getDb(env);
  const normalized = normalizeUrl(url);
  const rows = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.urlNormalized, normalized), isNull(bookmarks.deletedAt)));
  if (rows.some((row) => row.id !== excludeId)) {
    throw new ServiceError(409, 'conflict', '这个网址已经存在');
  }
}

export async function listBookmarks(
  env: Bindings,
  options: {
    categoryId?: number;
    includeChildren?: boolean;
    tag?: string;
    view?: BookmarkView;
  } = {},
): Promise<BookmarkDto[]> {
  const db = getDb(env);
  const view = options.view ?? 'active';
  const viewCondition =
    view === 'active'
      ? and(isNull(bookmarks.deletedAt), isNull(bookmarks.archivedAt))
      : view === 'archive'
        ? and(isNull(bookmarks.deletedAt), sql`${bookmarks.archivedAt} IS NOT NULL`)
        : view === 'trash'
          ? sql`${bookmarks.deletedAt} IS NOT NULL`
          : undefined;
  const tagCondition = options.tag
    ? sql`EXISTS (
        SELECT 1
        FROM bookmark_tags AS filter_bt
        INNER JOIN tags AS filter_t ON filter_bt.tag_id = filter_t.id
        WHERE filter_bt.bookmark_id = ${bookmarks.id}
          AND filter_t.slug = ${slugify(options.tag)}
      )`
    : undefined;
  const conditions = [
    viewCondition,
    !options.includeChildren && options.categoryId !== undefined
      ? eq(bookmarks.categoryId, options.categoryId)
      : undefined,
    tagCondition,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);
  let rows: Bookmark[];
  if (options.categoryId !== undefined && options.includeChildren) {
    const raw = await db.all<BookmarkRow>(sql`
      WITH RECURSIVE subtree(id) AS (
        SELECT id FROM categories WHERE id = ${options.categoryId}
        UNION ALL SELECT categories.id FROM categories JOIN subtree ON categories.parent_id = subtree.id
      )
      SELECT b.*
      FROM bookmarks b
      JOIN subtree s ON b.category_id = s.id
      WHERE ${
        view === 'active'
          ? sql`b.deleted_at IS NULL AND b.archived_at IS NULL`
          : view === 'archive'
            ? sql`b.deleted_at IS NULL AND b.archived_at IS NOT NULL`
            : view === 'trash'
              ? sql`b.deleted_at IS NOT NULL`
              : sql`1 = 1`
      }
      ${
        options.tag
          ? sql`AND EXISTS (
          SELECT 1
          FROM bookmark_tags AS filter_bt
          INNER JOIN tags AS filter_t ON filter_bt.tag_id = filter_t.id
          WHERE filter_bt.bookmark_id = b.id
            AND filter_t.slug = ${slugify(options.tag)}
        )`
          : sql``
      }
      ORDER BY b.sort_order, b.id
    `);
    rows = raw.map(fromRaw);
  } else {
    rows = await db
      .select()
      .from(bookmarks)
      .where(and(...conditions))
      .orderBy(bookmarks.sortOrder, bookmarks.id);
  }
  return withTags(env, rows);
}

export async function getBookmark(env: Bindings, id: number): Promise<BookmarkDto> {
  const db = getDb(env);
  const [bookmark] = await db.select().from(bookmarks).where(eq(bookmarks.id, id));
  if (!bookmark) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  const [dto] = await withTags(env, [bookmark]);
  return dto;
}

export async function listPinnedBookmarks(env: Bindings): Promise<BookmarkDto[]> {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(bookmarks)
    .where(
      and(eq(bookmarks.isPinned, true), isNull(bookmarks.deletedAt), isNull(bookmarks.archivedAt)),
    )
    .orderBy(bookmarks.sortOrder, bookmarks.id);
  return withTags(env, rows);
}

function buildFtsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' OR ');
}

export async function searchBookmarks(env: Bindings, query: string): Promise<BookmarkDto[]> {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];
  const db = getDb(env);
  try {
    const raw = await db.all<BookmarkRow>(
      sql`SELECT b.* FROM bookmarks b JOIN bookmarks_fts ON b.id = bookmarks_fts.rowid WHERE bookmarks_fts MATCH ${ftsQuery} AND b.deleted_at IS NULL AND b.archived_at IS NULL ORDER BY rank LIMIT 100`,
    );
    return withTags(env, raw.map(fromRaw));
  } catch {
    return [];
  }
}

export async function listTags(env: Bindings): Promise<TagDto[]> {
  const db = getDb(env);
  const rows = await db.all<{ id: number; name: string; slug: string; bookmark_count: number }>(
    sql`SELECT t.id, t.name, t.slug, COUNT(CASE WHEN b.deleted_at IS NULL AND b.archived_at IS NULL THEN 1 END) AS bookmark_count FROM tags t LEFT JOIN bookmark_tags bt ON bt.tag_id=t.id LEFT JOIN bookmarks b ON b.id=bt.bookmark_id GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    bookmarkCount: Number(row.bookmark_count),
  }));
}

export async function createBookmark(env: Bindings, input: BookmarkWrite): Promise<BookmarkDto> {
  await assertNotDuplicate(env, input.url);
  const categoryId = input.categoryId ?? (await ensureDefaultCategory(env));
  if (!(await categoryExists(env, categoryId)))
    throw new ServiceError(404, 'not_found', 'Category not found');
  const db = getDb(env);
  const values: NewBookmark = {
    categoryId,
    title: input.title,
    url: input.url,
    description: input.description,
    iconUrl: input.iconUrl,
    isPinned: input.isPinned,
    sortOrder: input.sortOrder,
    urlNormalized: normalizeUrl(input.url),
  };
  const [bookmark] = await db.insert(bookmarks).values(values).returning();
  await replaceTags(env, bookmark.id, input.tags);
  return getBookmark(env, bookmark.id);
}

export async function updateBookmark(
  env: Bindings,
  id: number,
  input: Partial<BookmarkWrite>,
): Promise<BookmarkDto> {
  const db = getDb(env);
  const [current] = await db.select().from(bookmarks).where(eq(bookmarks.id, id));
  if (!current) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  if (current.deletedAt || current.archivedAt)
    throw new ServiceError(400, 'validation_error', '归档或回收站中的书签不可编辑');
  if (input.url !== undefined) await assertNotDuplicate(env, input.url, id);
  if (
    input.categoryId !== undefined &&
    input.categoryId !== null &&
    !(await categoryExists(env, input.categoryId))
  )
    throw new ServiceError(404, 'not_found', 'Category not found');
  const categoryUpdate =
    input.categoryId === undefined
      ? {}
      : {
          categoryId:
            input.categoryId === null ? await ensureDefaultCategory(env) : input.categoryId,
        };
  const [bookmark] = await db
    .update(bookmarks)
    .set({
      ...categoryUpdate,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.url !== undefined
        ? { url: input.url, urlNormalized: normalizeUrl(input.url) }
        : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl } : {}),
      ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(bookmarks.id, id))
    .returning();
  await replaceTags(env, id, input.tags);
  return getBookmark(env, bookmark.id);
}

export async function archiveBookmark(env: Bindings, id: number): Promise<BookmarkDto> {
  const db = getDb(env);
  const [row] = await db
    .update(bookmarks)
    .set({ archivedAt: sql`CURRENT_TIMESTAMP`, isPinned: false, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(bookmarks.id, id), isNull(bookmarks.deletedAt)))
    .returning();
  if (!row) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  return getBookmark(env, id);
}

export async function restoreBookmark(env: Bindings, id: number): Promise<BookmarkDto> {
  const db = getDb(env);
  const [current] = await db
    .select({ url: bookmarks.url })
    .from(bookmarks)
    .where(eq(bookmarks.id, id));
  if (!current) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  await assertNotDuplicate(env, current.url, id);
  const [row] = await db
    .update(bookmarks)
    .set({ archivedAt: null, deletedAt: null, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(bookmarks.id, id))
    .returning();
  if (!row) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  return getBookmark(env, id);
}

export async function deleteBookmark(env: Bindings, id: number): Promise<void> {
  const db = getDb(env);
  const [row] = await db
    .update(bookmarks)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP`, isPinned: false, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(bookmarks.id, id), isNull(bookmarks.deletedAt)))
    .returning({ id: bookmarks.id });
  if (!row) throw new ServiceError(404, 'not_found', 'Bookmark not found');
}

export async function permanentlyDeleteBookmark(env: Bindings, id: number): Promise<void> {
  const db = getDb(env);
  const row = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, id), sql`${bookmarks.deletedAt} IS NOT NULL`))
    .returning({ id: bookmarks.id });
  if (row.length === 0) throw new ServiceError(404, 'not_found', 'Bookmark not found');
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
  if (existing.length !== ids.length)
    throw new ServiceError(404, 'not_found', 'Bookmark not found');
  const categoryId = existing[0]?.categoryId;
  if (existing.some((bookmark) => bookmark.categoryId !== categoryId))
    throw new ServiceError(400, 'validation_error', 'Bookmarks must share the same category');
  const updates = items.map((item) =>
    db
      .update(bookmarks)
      .set({ sortOrder: item.sortOrder, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(bookmarks.id, item.id)),
  );
  await db.batch(updates as [(typeof updates)[number], ...typeof updates]);
}
