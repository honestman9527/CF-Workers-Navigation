import type { Visibility } from '../../shared/api/types';
import type {
  Bookmark as BookmarkDto,
  BookmarkListOptions,
  BookmarkPage,
  BookmarkView,
} from '../../shared/api/types';
import type { Db } from '../types';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { UNCATEGORIZED_SLUG } from '../../shared/api/types';
import {
  decodeListCursor,
  decodeManualListCursor,
  decodeSearchCursor,
  encodeListCursor,
  encodeManualListCursor,
  encodeSearchCursor,
} from '../cursor';
import { bookmarks } from '../schema';
import { getDefaultVisibility } from '../settings';
import { slugify } from '../slug';
import {
  publicBookmarkCondition,
  bookmarkEffectiveVisibility,
  categoryEffectiveVisibility,
} from '../visibility';
import { bookmarkTagStatements } from './bookmark-tags';
import { assertCategoryExists } from './categories';
import { ServiceError } from './errors';

type BookmarkRow = {
  visibility: Visibility;
  effective_visibility: Visibility;
  id: number;
  title: string;
  url: string;
  description: string | null;
  icon_url: string | null;
  sort_order: number;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  tag_names: string;
};

type SearchRow = BookmarkRow & { rank: number };

export type BookmarkWrite = {
  visibility?: Visibility;
  title: string;
  url: string;
  description?: string | null;
  iconUrl?: string | null;
  categoryId?: number | null;
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
    visibility: row.visibility,
    effectiveVisibility: row.effective_visibility,
    title: row.title,
    url: row.url,
    description: row.description,
    iconUrl: row.icon_url,
    sortOrder: row.sort_order,
    categoryId: row.category_id,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    tags: parseTags(row.tag_names),
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function viewCondition(view: BookmarkView): ReturnType<typeof sql> {
  if (view === 'active') return sql`b.deleted_at IS NULL AND b.archived_at IS NULL`;
  if (view === 'archive') return sql`b.deleted_at IS NULL AND b.archived_at IS NOT NULL`;
  if (view === 'trash') return sql`b.deleted_at IS NOT NULL`;
  return sql`1 = 1`;
}

const tagProjection = sql`COALESCE(json_group_array(CASE WHEN t.id IS NULL THEN NULL ELSE t.name END), '[]')`;

/** 分类过滤：未分类走 IS NULL；直属用等值匹配，默认递归取子树，未知 slug 得空集。 */
function categoryConditions(
  category: string | undefined,
  categoryOnly = false,
): {
  cte: ReturnType<typeof sql>;
  condition: ReturnType<typeof sql>;
} {
  if (!category) return { cte: sql``, condition: sql`` };
  if (category === UNCATEGORIZED_SLUG) {
    return { cte: sql``, condition: sql`AND b.category_id IS NULL` };
  }
  if (categoryOnly) {
    return {
      cte: sql``,
      condition: sql`AND b.category_id = (SELECT id FROM categories WHERE slug = ${slugify(category)})`,
    };
  }
  return {
    cte: sql`
      WITH RECURSIVE category_subtree(id) AS (
        SELECT id FROM categories WHERE slug = ${slugify(category)}
        UNION
        SELECT c.id FROM categories c INNER JOIN category_subtree s ON c.parent_id = s.id
      )
    `,
    condition: sql`AND b.category_id IN (SELECT id FROM category_subtree)`,
  };
}

type BookmarkFilter = Pick<
  BookmarkListOptions,
  'view' | 'category' | 'categoryOnly' | 'tag' | 'untagged'
>;

/** 列表与搜索共用的过滤片段：condition 以 AND 开头，可接在 WHERE 主表达式之后。 */
function buildFilter(
  filter: BookmarkFilter,
  authed: boolean,
): {
  cte: ReturnType<typeof sql>;
  condition: ReturnType<typeof sql>;
} {
  const { cte: categoryCte, condition: categoryCondition } = categoryConditions(
    filter.category,
    filter.categoryOnly,
  );
  const tagCondition = filter.tag
    ? sql`AND EXISTS (
        SELECT 1 FROM bookmark_tags filter_bt
        INNER JOIN tags filter_t ON filter_t.id = filter_bt.tag_id
        WHERE filter_bt.bookmark_id = b.id AND filter_t.slug = ${slugify(filter.tag)}
      )`
    : sql``;
  const untaggedCondition = filter.untagged
    ? sql`AND NOT EXISTS (SELECT 1 FROM bookmark_tags empty_bt WHERE empty_bt.bookmark_id = b.id)`
    : sql``;
  return {
    cte: categoryCte,
    condition: sql`${authed ? sql`` : sql`AND ${publicBookmarkCondition}`} AND ${viewCondition(filter.view ?? 'active')} ${tagCondition} ${untaggedCondition} ${categoryCondition}`,
  };
}

/** 分页计数只扫描筛选所需的表，避免列表投影的标签连接与聚合。 */
async function countByFilter(
  db: Db,
  filter: { cte: ReturnType<typeof sql>; condition: ReturnType<typeof sql> },
  from: ReturnType<typeof sql>,
): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`
    ${filter.cte}
    SELECT COUNT(*) AS total
    ${from}
    WHERE 1 = 1 ${filter.condition}
  `);
  return row?.total ?? 0;
}

const listCountFrom = sql`FROM bookmarks b`;
const searchCountFrom = sql`
  FROM bookmarks_fts
  INNER JOIN bookmarks b ON b.id = bookmarks_fts.rowid
`;

const bookmarkColumns = sql`
    b.visibility, ${bookmarkEffectiveVisibility} AS effective_visibility, b.id, b.title, b.url, b.description, b.icon_url, b.sort_order,
    b.archived_at, b.deleted_at, b.created_at, b.updated_at,
    b.category_id, c.name AS category_name, c.slug AS category_slug,
    ${tagProjection} AS tag_names
`;

const bookmarkJoins = sql`
  FROM bookmarks b
  INNER JOIN bookmark_page page ON page.id = b.id
  LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
  LEFT JOIN tags t ON t.id = bt.tag_id
  LEFT JOIN categories c ON c.id = b.category_id
`;

const listSelect = sql`SELECT ${bookmarkColumns} ${bookmarkJoins}`;

const searchSelect = sql`
  SELECT ${bookmarkColumns}, page.rank AS rank ${bookmarkJoins}
`;

function usesManualOrder(options: BookmarkListOptions): boolean {
  return Boolean(
    options.category && (options.categoryOnly || options.category === UNCATEGORIZED_SLUG),
  );
}

async function queryRows(
  db: Db,
  options: BookmarkListOptions & { id?: number } = {},
  authed: boolean,
): Promise<BookmarkRow[]> {
  const manualOrder = options.id === undefined && usesManualOrder(options);
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const { cte, condition } = buildFilter(options, authed);
  let cursorCondition = sql``;
  if (manualOrder) {
    const cursor = decodeManualListCursor(options.cursor);
    if (cursor) {
      cursorCondition = sql`AND (b.sort_order > ${cursor.sortOrder} OR (b.sort_order = ${cursor.sortOrder} AND b.id > ${cursor.id}))`;
    }
  } else {
    const cursor = decodeListCursor(options.cursor);
    if (cursor) {
      cursorCondition = sql`AND (b.created_at < ${cursor.createdAt} OR (b.created_at = ${cursor.createdAt} AND b.id < ${cursor.id}))`;
    }
  }
  const orderBy = manualOrder
    ? sql`ORDER BY b.sort_order ASC, b.id ASC`
    : sql`ORDER BY b.created_at DESC, b.id DESC`;
  const idCondition = options.id === undefined ? sql`` : sql`AND b.id = ${options.id}`;
  return db.all<BookmarkRow>(sql`
    WITH bookmark_page AS MATERIALIZED (
      ${cte}
      SELECT b.id FROM bookmarks b
      WHERE 1 = 1 ${condition} ${cursorCondition} ${idCondition}
      ${orderBy}
      LIMIT ${options.id === undefined ? limit + 1 : 1}
    )
    ${listSelect}
    GROUP BY b.id
    ${orderBy}
  `);
}

export async function listBookmarks(
  db: Db,
  options: BookmarkListOptions = {},
  authed: boolean,
): Promise<BookmarkPage> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const manualOrder = usesManualOrder(options);
  const orderBy = manualOrder
    ? sql`ORDER BY b.sort_order ASC, b.id ASC`
    : sql`ORDER BY b.created_at DESC, b.id DESC`;

  // 分页模式（携带 offset）：并行执行列表与计数查询，减少一次 RTT，游标置空。
  if (options.offset !== undefined) {
    const { cte, condition } = buildFilter(options, authed);
    const [rows, total] = await Promise.all([
      db.all<BookmarkRow>(sql`
        WITH bookmark_page AS MATERIALIZED (
          ${cte}
          SELECT b.id FROM bookmarks b
          WHERE 1 = 1 ${condition}
          ${orderBy}
          LIMIT ${limit} OFFSET ${options.offset}
        )
        ${listSelect}
        GROUP BY b.id
        ${orderBy}
      `),
      countByFilter(db, { cte, condition }, listCountFrom),
    ]);
    return { items: rows.map(toDto), nextCursor: null, total };
  }

  const rows = await queryRows(db, { ...options, limit }, authed);
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toDto);
  const last = rows[limit - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? manualOrder
          ? encodeManualListCursor({ sortOrder: last.sort_order, id: last.id })
          : encodeListCursor({ createdAt: last.created_at, id: last.id })
        : null,
  };
}

const MAX_FTS_TOKENS = 10;

function buildFtsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .slice(0, MAX_FTS_TOKENS)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' OR ');
}

export async function searchBookmarks(
  db: Db,
  query: string,
  options: BookmarkListOptions = {},
  authed: boolean,
): Promise<BookmarkPage> {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) {
    return options.offset !== undefined
      ? { items: [], nextCursor: null, total: 0 }
      : { items: [], nextCursor: null };
  }
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const { cte, condition } = buildFilter(options, authed);

  // 分页模式（携带 offset）：并行执行搜索与计数查询，游标置空。
  if (options.offset !== undefined) {
    const [rows, total] = await Promise.all([
      db.all<SearchRow>(sql`
        WITH bookmark_page AS MATERIALIZED (
          ${cte}
          SELECT b.id, bookmarks_fts.rank AS rank
          ${searchCountFrom}
          WHERE bookmarks_fts MATCH ${ftsQuery} ${condition}
          ORDER BY bookmarks_fts.rank ASC, b.id DESC
          LIMIT ${limit} OFFSET ${options.offset}
        )
        ${searchSelect}
        GROUP BY b.id
        ORDER BY page.rank ASC, b.id DESC
      `),
      countByFilter(
        db,
        { cte, condition: sql`AND bookmarks_fts MATCH ${ftsQuery} ${condition}` },
        searchCountFrom,
      ),
    ]);
    return { items: rows.map(toDto), nextCursor: null, total };
  }

  const cursor = decodeSearchCursor(options.cursor);
  const cursorCondition = cursor
    ? sql`AND (bookmarks_fts.rank > ${cursor.rank} OR (bookmarks_fts.rank = ${cursor.rank} AND b.id < ${cursor.id}))`
    : sql``;
  const rows = await db.all<SearchRow>(sql`
    WITH bookmark_page AS MATERIALIZED (
      ${cte}
      SELECT b.id, bookmarks_fts.rank AS rank
      ${searchCountFrom}
      WHERE bookmarks_fts MATCH ${ftsQuery} ${condition} ${cursorCondition}
      ORDER BY bookmarks_fts.rank ASC, b.id DESC
      LIMIT ${limit + 1}
    )
    ${searchSelect}
    GROUP BY b.id
    ORDER BY page.rank ASC, b.id DESC
  `);
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toDto);
  const last = rows[limit - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeSearchCursor({ rank: last.rank, id: last.id }) : null,
  };
}

export async function getBookmark(db: Db, id: number, authed: boolean): Promise<BookmarkDto> {
  const [row] = await queryRows(db, { view: authed ? 'all' : 'active', id }, authed);
  if (!row) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  return toDto(row);
}

async function assertNotDuplicate(
  db: Db,
  url: string,
  categoryId: number | null,
  excludeId?: number,
) {
  const normalized = normalizeUrl(url);
  const categoryScope =
    categoryId === null ? isNull(bookmarks.categoryId) : eq(bookmarks.categoryId, categoryId);
  const rows = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(eq(bookmarks.urlNormalized, normalized), categoryScope, isNull(bookmarks.deletedAt)),
    );
  if (rows.some((row) => row.id !== excludeId)) {
    throw new ServiceError(
      409,
      'conflict',
      categoryId === null ? '未分类中已存在相同网址' : '该分类下已存在相同网址',
    );
  }
}

function scopedBookmarkCondition(normalized: string, categoryId: number | null) {
  return and(
    eq(bookmarks.urlNormalized, normalized),
    categoryId === null ? isNull(bookmarks.categoryId) : eq(bookmarks.categoryId, categoryId),
    isNull(bookmarks.deletedAt),
  )!;
}

async function nextBookmarkSortOrder(db: Db, categoryId: number | null): Promise<number> {
  const [orderRow] = await db.all<{ next_order: number }>(sql`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
    FROM bookmarks
    WHERE ${categoryId === null ? sql`category_id IS NULL` : sql`category_id = ${categoryId}`}
  `);
  return Number(orderRow?.next_order ?? 0);
}

export async function createBookmark(db: Db, input: BookmarkWrite): Promise<BookmarkDto> {
  const categoryId = input.categoryId ?? null;
  if (categoryId !== null) {
    await assertCategoryExists(db, categoryId);
  }
  await assertNotDuplicate(db, input.url, categoryId);
  const normalized = normalizeUrl(input.url);
  const sortOrder = await nextBookmarkSortOrder(db, categoryId);
  const write = db
    .insert(bookmarks)
    .values({
      title: input.title,
      url: input.url,
      description: input.description,
      iconUrl: input.iconUrl,
      categoryId,
      sortOrder,
      visibility:
        input.visibility ?? (await getDefaultVisibility(db, 'default_bookmark_visibility')),
      urlNormalized: normalized,
    })
    .returning();
  const [[bookmark]] = await db.batch([
    write,
    ...bookmarkTagStatements(db, scopedBookmarkCondition(normalized, categoryId), input.tags),
  ]);
  return getBookmark(db, bookmark.id, true);
}

export async function updateBookmark(
  db: Db,
  id: number,
  input: Partial<BookmarkWrite>,
): Promise<BookmarkDto> {
  const [current] = await db
    .select({
      id: bookmarks.id,
      url: bookmarks.url,
      categoryId: bookmarks.categoryId,
      archivedAt: bookmarks.archivedAt,
      deletedAt: bookmarks.deletedAt,
    })
    .from(bookmarks)
    .where(eq(bookmarks.id, id));
  if (!current) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  if (current.deletedAt || current.archivedAt) {
    throw new ServiceError(400, 'validation_error', '归档或回收站中的书签不可编辑');
  }
  if (input.categoryId !== undefined && input.categoryId !== null) {
    await assertCategoryExists(db, input.categoryId);
  }
  const targetCategoryId = input.categoryId !== undefined ? input.categoryId : current.categoryId;
  const targetUrl = input.url ?? current.url;
  const categoryChanged = targetCategoryId !== current.categoryId;
  if (input.url !== undefined || categoryChanged) {
    await assertNotDuplicate(db, targetUrl, targetCategoryId, id);
  }
  const nextSortOrder = categoryChanged
    ? await nextBookmarkSortOrder(db, targetCategoryId ?? null)
    : undefined;
  const activeCondition = and(
    eq(bookmarks.id, id),
    isNull(bookmarks.deletedAt),
    isNull(bookmarks.archivedAt),
  )!;
  const write = db
    .update(bookmarks)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.url !== undefined
        ? { url: input.url, urlNormalized: normalizeUrl(input.url) }
        : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(nextSortOrder !== undefined ? { sortOrder: nextSortOrder } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(activeCondition)
    .returning();
  const [[bookmark]] = await db.batch([
    write,
    ...bookmarkTagStatements(db, activeCondition, input.tags),
  ]);
  if (!bookmark) {
    const [latest] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(eq(bookmarks.id, id));
    if (!latest) throw new ServiceError(404, 'not_found', 'Bookmark not found');
    throw new ServiceError(400, 'validation_error', '归档或回收站中的书签不可编辑');
  }
  return getBookmark(db, bookmark.id, true);
}

export async function copyBookmark(
  db: Db,
  id: number,
  targetCategoryId: number | null,
): Promise<BookmarkDto> {
  const source = await getBookmark(db, id, true);
  if (source.deletedAt || source.archivedAt) {
    throw new ServiceError(400, 'validation_error', '归档或回收站中的书签不可复制');
  }
  if (targetCategoryId === source.categoryId) {
    throw new ServiceError(400, 'validation_error', '书签已在该分类中');
  }
  let targetEffectiveVisibility: Visibility = 'public';
  if (targetCategoryId !== null) {
    const [targetCategory] = await db.all<{ id: number; effectiveVisibility: Visibility }>(sql`
      SELECT c.id, ${categoryEffectiveVisibility} AS effectiveVisibility
      FROM categories c
      WHERE c.id = ${targetCategoryId}
    `);
    if (!targetCategory) throw new ServiceError(404, 'not_found', '分类不存在');
    targetEffectiveVisibility = targetCategory.effectiveVisibility;
  }
  await assertNotDuplicate(db, source.url, targetCategoryId);

  const normalized = normalizeUrl(source.url);
  const sortOrder = await nextBookmarkSortOrder(db, targetCategoryId);
  const visibility: Visibility =
    source.effectiveVisibility === 'private' && targetEffectiveVisibility !== 'private'
      ? 'private'
      : source.visibility;

  const write = db
    .insert(bookmarks)
    .values({
      title: source.title,
      url: source.url,
      description: source.description,
      iconUrl: source.iconUrl,
      categoryId: targetCategoryId,
      sortOrder,
      visibility,
      urlNormalized: normalized,
    })
    .returning();
  const [[bookmark]] = await db.batch([
    write,
    ...(source.tags.length > 0
      ? bookmarkTagStatements(
          db,
          scopedBookmarkCondition(normalized, targetCategoryId),
          source.tags,
        )
      : []),
  ]);
  return getBookmark(db, bookmark.id, true);
}

export async function archiveBookmark(db: Db, id: number): Promise<BookmarkDto> {
  const [row] = await db
    .update(bookmarks)
    .set({ archivedAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(bookmarks.id, id), isNull(bookmarks.deletedAt)))
    .returning({ id: bookmarks.id });
  if (!row) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  return getBookmark(db, id, true);
}

export async function restoreBookmark(db: Db, id: number): Promise<BookmarkDto> {
  const [current] = await db
    .select({ url: bookmarks.url, categoryId: bookmarks.categoryId })
    .from(bookmarks)
    .where(eq(bookmarks.id, id));
  if (!current) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  await assertNotDuplicate(db, current.url, current.categoryId, id);
  const [row] = await db
    .update(bookmarks)
    .set({ archivedAt: null, deletedAt: null, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(bookmarks.id, id))
    .returning({ id: bookmarks.id });
  if (!row) throw new ServiceError(404, 'not_found', 'Bookmark not found');
  return getBookmark(db, id, true);
}

export async function deleteBookmark(db: Db, id: number): Promise<void> {
  const [row] = await db
    .update(bookmarks)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
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

// 每条 CASE WHEN 批量排序语句绑定 30 * 3 = 90 个参数（低于 D1 100 参数硬上限）。
const REORDER_CHUNK_SIZE = 30;

export async function reorderBookmarks(db: Db, ids: number[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new ServiceError(400, 'validation_error', '至少需要一个书签');
  if (unique.length > 500) {
    throw new ServiceError(400, 'validation_error', '一次最多排序 500 个书签');
  }

  const rows: Array<{
    id: number;
    categoryId: number | null;
    sortOrder: number;
    archivedAt: string | null;
    deletedAt: string | null;
  }> = [];
  for (let index = 0; index < unique.length; index += 100) {
    rows.push(
      ...(await db
        .select({
          id: bookmarks.id,
          categoryId: bookmarks.categoryId,
          sortOrder: bookmarks.sortOrder,
          archivedAt: bookmarks.archivedAt,
          deletedAt: bookmarks.deletedAt,
        })
        .from(bookmarks)
        .where(inArray(bookmarks.id, unique.slice(index, index + 100)))),
    );
  }
  if (rows.length !== unique.length) {
    throw new ServiceError(404, 'not_found', '某些书签不存在');
  }
  if (rows.some((row) => row.archivedAt !== null || row.deletedAt !== null)) {
    throw new ServiceError(400, 'validation_error', '只能对使用中的书签排序');
  }
  const categories = new Set(rows.map((row) => row.categoryId ?? null));
  if (categories.size > 1) {
    throw new ServiceError(400, 'validation_error', '只能对同一分类内的书签排序');
  }

  const categoryId = rows[0].categoryId ?? null;
  const existingSorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const slots = existingSorted.map((row) => row.sortOrder);
  const strictlyIncreasing = slots.every((value, index) => index === 0 || value > slots[index - 1]);

  const updates: Array<{ id: number; sortOrder: number }> = [];
  if (strictlyIncreasing) {
    const currentById = new Map(rows.map((row) => [row.id, row.sortOrder]));
    for (let index = 0; index < unique.length; index += 1) {
      const id = unique[index];
      const nextOrder = slots[index];
      if (currentById.get(id) !== nextOrder) {
        updates.push({ id, sortOrder: nextOrder });
      }
    }
  } else {
    const allActive = await db
      .select({ id: bookmarks.id, sortOrder: bookmarks.sortOrder })
      .from(bookmarks)
      .where(
        and(
          categoryId === null ? isNull(bookmarks.categoryId) : eq(bookmarks.categoryId, categoryId),
          isNull(bookmarks.deletedAt),
          isNull(bookmarks.archivedAt),
        ),
      )
      .orderBy(bookmarks.sortOrder, bookmarks.id);

    if (allActive.length <= 500) {
      const targetSet = new Set(unique);
      const currentById = new Map(allActive.map((row) => [row.id, row.sortOrder]));
      let cursor = 0;
      for (let index = 0; index < allActive.length; index += 1) {
        const nextId = targetSet.has(allActive[index].id) ? unique[cursor++] : allActive[index].id;
        if (currentById.get(nextId) !== index) {
          updates.push({ id: nextId, sortOrder: index });
        }
      }
    } else {
      const currentById = new Map(rows.map((row) => [row.id, row.sortOrder]));
      const base = slots[0];
      for (let index = 0; index < unique.length; index += 1) {
        const id = unique[index];
        const nextOrder = base + index;
        if (currentById.get(id) !== nextOrder) {
          updates.push({ id, sortOrder: nextOrder });
        }
      }
    }
  }

  if (updates.length === 0) return;

  const statements = [];
  for (let start = 0; start < updates.length; start += REORDER_CHUNK_SIZE) {
    const chunk = updates.slice(start, start + REORDER_CHUNK_SIZE);
    const cases = chunk.map((item) => sql`WHEN ${item.id} THEN ${item.sortOrder}`);
    const chunkIds = chunk.map((item) => item.id);
    statements.push(
      db
        .update(bookmarks)
        .set({
          sortOrder: sql`CASE ${bookmarks.id} ${sql.join(cases, sql` `)} END`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(inArray(bookmarks.id, chunkIds)),
    );
  }
  await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
}
