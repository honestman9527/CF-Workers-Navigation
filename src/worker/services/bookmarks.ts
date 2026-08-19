import type {
  Bookmark as BookmarkDto,
  BookmarkListOptions,
  BookmarkPage,
  BookmarkView,
  Tag as TagDto,
} from '../../shared/api/types';
import type { Db } from '../types';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  decodeListCursor,
  decodeSearchCursor,
  encodeListCursor,
  encodeSearchCursor,
} from '../cursor';
import { bookmarkTags, bookmarks, tags } from '../schema';
import { ServiceError } from './errors';

type BookmarkRow = {
  id: number;
  title: string;
  url: string;
  description: string | null;
  icon_url: string | null;
  is_pinned: number;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  tag_names: string;
};

type SearchRow = BookmarkRow & { rank: number };

export type BookmarkWrite = {
  title: string;
  url: string;
  description?: string | null;
  iconUrl?: string | null;
  isPinned?: boolean;
  tags?: string[];
};

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

export function slugify(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '');
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function toDto(row: BookmarkRow): BookmarkDto {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    description: row.description,
    iconUrl: row.icon_url,
    isPinned: Boolean(row.is_pinned),
    tags: parseTags(row.tag_names),
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanTagNames(names: string[] | undefined): Array<{ name: string; slug: string }> {
  if (names === undefined) return [];
  const unique = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    const slug = slugify(name);
    if (name && slug && !unique.has(slug)) unique.set(slug, name);
  }
  return [...unique].slice(0, 30).map(([slug, name]) => ({ slug, name }));
}

export async function replaceTags(db: Db, bookmarkId: number, names: string[] | undefined) {
  if (names === undefined) return;
  const clean = cleanTagNames(names);
  await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, bookmarkId));
  if (clean.length === 0) return;

  const slugs = clean.map((tag) => tag.slug);
  await db.insert(tags).values(clean).onConflictDoNothing({ target: tags.slug });
  const resolved = await db.select({ id: tags.id }).from(tags).where(inArray(tags.slug, slugs));
  if (resolved.length > 0) {
    await db
      .insert(bookmarkTags)
      .values(resolved.map((tag) => ({ bookmarkId, tagId: tag.id })))
      .onConflictDoNothing();
  }
}

function viewCondition(view: BookmarkView): ReturnType<typeof sql> {
  if (view === 'active') return sql`b.deleted_at IS NULL AND b.archived_at IS NULL`;
  if (view === 'archive') return sql`b.deleted_at IS NULL AND b.archived_at IS NOT NULL`;
  if (view === 'trash') return sql`b.deleted_at IS NOT NULL`;
  return sql`1 = 1`;
}

const tagProjection = sql`COALESCE(json_group_array(CASE WHEN t.id IS NULL THEN NULL ELSE t.name END), '[]')`;

async function queryRows(
  db: Db,
  options: BookmarkListOptions & { id?: number } = {},
): Promise<BookmarkRow[]> {
  const view = options.view ?? 'active';
  const cursor = decodeListCursor(options.cursor);
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const tagCondition = options.tag
    ? sql`AND EXISTS (
        SELECT 1 FROM bookmark_tags filter_bt
        INNER JOIN tags filter_t ON filter_t.id = filter_bt.tag_id
        WHERE filter_bt.bookmark_id = b.id AND filter_t.slug = ${slugify(options.tag)}
      )`
    : sql``;
  const pinnedCondition = options.pinned ? sql`AND b.is_pinned = 1` : sql``;
  const cursorCondition = cursor
    ? sql`AND (b.created_at < ${cursor.createdAt} OR (b.created_at = ${cursor.createdAt} AND b.id < ${cursor.id}))`
    : sql``;
  const idCondition = options.id === undefined ? sql`` : sql`AND b.id = ${options.id}`;
  return db.all<BookmarkRow>(sql`
    SELECT b.id, b.title, b.url, b.description, b.icon_url, b.is_pinned,
      b.archived_at, b.deleted_at, b.created_at, b.updated_at,
      ${tagProjection} AS tag_names
    FROM bookmarks b
    LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
    LEFT JOIN tags t ON t.id = bt.tag_id
    WHERE ${viewCondition(view)} ${tagCondition} ${pinnedCondition} ${cursorCondition} ${idCondition}
    GROUP BY b.id
    ORDER BY b.created_at DESC, b.id DESC
    LIMIT ${options.id === undefined ? limit + 1 : 1}
  `);
}

export async function listBookmarks(
  db: Db,
  options: BookmarkListOptions = {},
): Promise<BookmarkPage> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const rows = await queryRows(db, { ...options, limit });
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toDto);
  const last = rows[limit - 1];
  return {
    items,
    nextCursor:
      hasMore && last ? encodeListCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

function buildFtsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' OR ');
}

export async function searchBookmarks(
  db: Db,
  query: string,
  options: BookmarkListOptions = {},
): Promise<BookmarkPage> {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return { items: [], nextCursor: null };
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const cursor = decodeSearchCursor(options.cursor);
  const cursorCondition = cursor
    ? sql`AND (bookmarks_fts.rank > ${cursor.rank} OR (bookmarks_fts.rank = ${cursor.rank} AND b.id < ${cursor.id}))`
    : sql``;
  const view = options.view ?? 'active';
  const tagCondition = options.tag
    ? sql`AND EXISTS (
        SELECT 1 FROM bookmark_tags filter_bt
        INNER JOIN tags filter_t ON filter_t.id = filter_bt.tag_id
        WHERE filter_bt.bookmark_id = b.id AND filter_t.slug = ${slugify(options.tag)}
      )`
    : sql``;
  const pinnedCondition = options.pinned ? sql`AND b.is_pinned = 1` : sql``;
  const rows = await db.all<SearchRow>(sql`
    SELECT b.id, b.title, b.url, b.description, b.icon_url, b.is_pinned,
      b.archived_at, b.deleted_at, b.created_at, b.updated_at,
      bookmarks_fts.rank AS rank, ${tagProjection} AS tag_names
    FROM bookmarks_fts
    INNER JOIN bookmarks b ON b.id = bookmarks_fts.rowid
    LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
    LEFT JOIN tags t ON t.id = bt.tag_id
    WHERE bookmarks_fts MATCH ${ftsQuery}
      AND ${viewCondition(view)} ${tagCondition} ${pinnedCondition} ${cursorCondition}
    GROUP BY b.id
    ORDER BY bookmarks_fts.rank ASC, b.id DESC
    LIMIT ${limit + 1}
  `);
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toDto);
  const last = rows[limit - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeSearchCursor({ rank: last.rank, id: last.id }) : null,
  };
}

export async function getBookmark(db: Db, id: number): Promise<BookmarkDto> {
  const [row] = await queryRows(db, { view: 'all', id });
  if (!row) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  return toDto(row);
}

export async function listTags(db: Db): Promise<TagDto[]> {
  const rows = await db.all<{ id: number; name: string; slug: string; bookmark_count: number }>(sql`
    SELECT t.id, t.name, t.slug,
      COUNT(CASE WHEN b.deleted_at IS NULL AND b.archived_at IS NULL THEN 1 END) AS bookmark_count
    FROM tags t
    LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
    LEFT JOIN bookmarks b ON b.id = bt.bookmark_id
    GROUP BY t.id
    ORDER BY t.name COLLATE NOCASE
  `);
  return rows.map((row) => ({ ...row, bookmarkCount: Number(row.bookmark_count) }));
}

async function assertNotDuplicate(db: Db, url: string, excludeId?: number) {
  const normalized = normalizeUrl(url);
  const rows = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.urlNormalized, normalized), isNull(bookmarks.deletedAt)));
  if (rows.some((row) => row.id !== excludeId)) {
    throw new ServiceError(409, 'conflict', '这个网址已经存在');
  }
}

export async function createBookmark(db: Db, input: BookmarkWrite): Promise<BookmarkDto> {
  await assertNotDuplicate(db, input.url);
  const [bookmark] = await db
    .insert(bookmarks)
    .values({
      title: input.title,
      url: input.url,
      description: input.description,
      iconUrl: input.iconUrl,
      isPinned: input.isPinned,
      urlNormalized: normalizeUrl(input.url),
    })
    .returning();
  await replaceTags(db, bookmark.id, input.tags);
  return getBookmark(db, bookmark.id);
}

export async function updateBookmark(
  db: Db,
  id: number,
  input: Partial<BookmarkWrite>,
): Promise<BookmarkDto> {
  const [current] = await db.select().from(bookmarks).where(eq(bookmarks.id, id));
  if (!current) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  if (current.deletedAt || current.archivedAt) {
    throw new ServiceError(400, 'validation_error', '归档或回收站中的书签不可编辑');
  }
  if (input.url !== undefined) await assertNotDuplicate(db, input.url, id);
  const [bookmark] = await db
    .update(bookmarks)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.url !== undefined
        ? { url: input.url, urlNormalized: normalizeUrl(input.url) }
        : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl } : {}),
      ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(bookmarks.id, id))
    .returning();
  await replaceTags(db, id, input.tags);
  return getBookmark(db, bookmark.id);
}

export async function archiveBookmark(db: Db, id: number): Promise<BookmarkDto> {
  const [row] = await db
    .update(bookmarks)
    .set({ archivedAt: sql`CURRENT_TIMESTAMP`, isPinned: false, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(bookmarks.id, id), isNull(bookmarks.deletedAt)))
    .returning({ id: bookmarks.id });
  if (!row) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  return getBookmark(db, id);
}

export async function restoreBookmark(db: Db, id: number): Promise<BookmarkDto> {
  const [current] = await db
    .select({ url: bookmarks.url })
    .from(bookmarks)
    .where(eq(bookmarks.id, id));
  if (!current) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  await assertNotDuplicate(db, current.url, id);
  const [row] = await db
    .update(bookmarks)
    .set({ archivedAt: null, deletedAt: null, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(bookmarks.id, id))
    .returning({ id: bookmarks.id });
  if (!row) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  return getBookmark(db, id);
}

export async function deleteBookmark(db: Db, id: number): Promise<void> {
  const [row] = await db
    .update(bookmarks)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP`, isPinned: false, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(bookmarks.id, id), isNull(bookmarks.deletedAt)))
    .returning({ id: bookmarks.id });
  if (!row) throw new ServiceError(404, 'not_found', 'Bookmark not found');
}

export async function permanentlyDeleteBookmark(db: Db, id: number): Promise<void> {
  const row = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, id), sql`${bookmarks.deletedAt} IS NOT NULL`))
    .returning({ id: bookmarks.id });
  if (row.length === 0) throw new ServiceError(404, 'not_found', 'Bookmark not found');
}
