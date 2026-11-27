import type { TransferLog } from '../observability';
import type {
  ImportStrategy,
  ImportSummary,
  TransferBookmark,
  TransferData,
} from '../transfer/types';
import type { Db } from '../types';

import { eq, sql, inArray } from 'drizzle-orm';

import {
  UNCATEGORIZED_SLUG,
  type CategorySystemKey,
  type Visibility,
} from '../../shared/api/types';
import { COMMON_CATEGORY_SYSTEM_KEY, MAX_CATEGORY_DEPTH } from '../../shared/category-rules';
import { bookmarks, categories } from '../schema';
import { slugify } from '../slug';
import { bookmarkEffectiveVisibility, categoryEffectiveVisibility } from '../visibility';
import { withBookmarkTagWrites } from './bookmark-tags';
import { normalizeUrl } from './bookmarks';
import { ServiceError } from './errors';

// D1 limits the number of bound parameters per statement. Each bookmark insert
// binds eleven values (including category_id, sort_order, and visibility), so eight rows stay well
// below the limit (8 * 11 = 88). Category inserts bind six values per row, so fifteen rows = 90 params.
const INSERT_CHUNK_SIZE = 8;
const CATEGORY_INSERT_CHUNK_SIZE = 15;
const UPDATE_CHUNK_SIZE = 25;
const MATCH_CHUNK_SIZE = 90;

type ImportMatch = {
  id: number;
  categoryId: number | null;
  urlNormalized: string;
  url: string;
  addedAt: string;
  deletedAt: string | null;
  visibility: Visibility;
  effectiveVisibility: Visibility;
};

async function readImportMatches(db: Db, data: TransferData): Promise<ImportMatch[]> {
  const activeUrls = new Set(
    data.bookmarks
      .filter((bookmark) => bookmark.deletedAt == null)
      .map((bookmark) => normalizeUrl(bookmark.url)),
  );
  const deletedUrls = new Set(
    data.bookmarks
      .filter((bookmark) => bookmark.deletedAt != null)
      .map((bookmark) => normalizeUrl(bookmark.url)),
  );
  if (!activeUrls.size && !deletedUrls.size) return [];
  const projection = sql`SELECT b.id, b.category_id AS categoryId, b.url_normalized AS urlNormalized, b.url,
    b.created_at AS addedAt, b.deleted_at AS deletedAt, b.visibility,
    ${bookmarkEffectiveVisibility} AS effectiveVisibility FROM bookmarks b`;
  const matches: ImportMatch[] = [];
  for (const [urls, status] of [
    [activeUrls, sql`b.deleted_at IS NULL`],
    [deletedUrls, sql`b.deleted_at IS NOT NULL`],
  ] as const) {
    for (const batch of chunks([...urls], MATCH_CHUNK_SIZE)) {
      matches.push(
        ...(await db.all<ImportMatch>(
          sql`${projection} WHERE ${status} AND ${inArray(sql`b.url_normalized`, batch)}`,
        )),
      );
    }
  }
  // Old records may predate normalized URLs; only this exceptional subset needs normalization.
  const legacy = await db.all<ImportMatch>(sql`${projection} WHERE b.url_normalized = ''`);
  matches.push(
    ...legacy.filter((row) =>
      (row.deletedAt === null ? activeUrls : deletedUrls).has(normalizeUrl(row.url)),
    ),
  );
  return matches;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/** 按 slug 建立分类映射并补齐缺失分类；内置「常用」自动映射到目标库已有内置分类。 */
async function upsertCategoriesForImport(
  db: Db,
  data: TransferData,
  log?: TransferLog,
): Promise<{
  slugToId: Map<string, number>;
  categoriesFlattened: number;
  commonCategoryId: number | null;
  backupHasSystemCommon: boolean;
}> {
  const slugToId = new Map<string, number>();

  const bySlug = new Map<
    string,
    {
      name: string;
      slug: string;
      icon: string | null;
      parentSlug: string | null;
      visibility: Visibility;
      systemKey?: CategorySystemKey | null;
    }
  >();
  for (const raw of data.categories ?? []) {
    const name = raw.name.trim();
    const slug = (raw.slug?.trim() || slugify(name)) as string;
    if (!slug || slug === UNCATEGORIZED_SLUG || bySlug.has(slug)) continue;
    bySlug.set(slug, {
      name,
      slug,
      visibility: raw.visibility ?? 'private',
      systemKey: raw.systemKey,
      icon: raw.icon ?? null,
      parentSlug: raw.parentSlug?.trim() || null,
    });
  }

  const existing = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      parentId: categories.parentId,
      visibility: categories.visibility,
      sortOrder: categories.sortOrder,
      systemKey: categories.systemKey,
    })
    .from(categories);
  const existingCommon = existing.find((row) => row.systemKey === COMMON_CATEGORY_SYSTEM_KEY);
  const backupHasSystemCommon = [...bySlug.values()].some(
    (entry) => entry.systemKey === COMMON_CATEGORY_SYSTEM_KEY,
  );
  const mappedCommonEntry = existingCommon
    ? backupHasSystemCommon
      ? [...bySlug.values()].find((entry) => entry.systemKey === COMMON_CATEGORY_SYSTEM_KEY)
      : [...bySlug.values()].find(
          (entry) =>
            entry.parentSlug === null && (entry.slug === 'common' || entry.slug === '常用'),
        )
    : undefined;

  // Existing categories retain their hierarchy and privacy when reused.
  const existingSlugs = new Set(existing.map((row) => row.slug));
  const idToSlug = new Map(existing.map((row) => [row.id, row.slug]));
  const parents = new Map(
    existing.map((row) => [
      row.slug,
      row.parentId === null ? null : (idToSlug.get(row.parentId) ?? null),
    ]),
  );
  if (existingCommon && mappedCommonEntry) {
    existingSlugs.add(mappedCommonEntry.slug);
    parents.set(mappedCommonEntry.slug, null);
    slugToId.set(mappedCommonEntry.slug, existingCommon.id);
  }
  for (const entry of bySlug.values())
    if (!existingSlugs.has(entry.slug)) parents.set(entry.slug, entry.parentSlug);
  if (data.version === 2) {
    for (const entry of bySlug.values()) {
      if (entry.parentSlug && !parents.has(entry.parentSlug))
        throw new ServiceError(400, 'validation_error', '备份引用了不存在的父分类');
    }
    for (const bookmark of data.bookmarks) {
      if (bookmark.categorySlug && !parents.has(bookmark.categorySlug))
        throw new ServiceError(400, 'validation_error', '备份引用了不存在的分类');
    }
  }
  const assertNoCycles = (parentSlugs: Map<string, string | null>) => {
    const checked = new Set<string>();
    for (const slug of parentSlugs.keys()) {
      const seen = new Set<string>();
      let current: string | null = slug;
      while (current && parentSlugs.has(current) && !checked.has(current)) {
        if (seen.has(current))
          throw new ServiceError(400, 'validation_error', '分类层级不能形成循环');
        seen.add(current);
        current = parentSlugs.get(current) ?? null;
      }
      for (const visited of seen) checked.add(visited);
    }
  };
  // Validate the backup itself even when an existing category keeps its hierarchy.
  assertNoCycles(new Map([...bySlug.values()].map((entry) => [entry.slug, entry.parentSlug])));
  assertNoCycles(parents);
  // Compute from the original merged tree before changing any parent or visibility.
  const visibility = new Map(existing.map((row) => [row.slug, row.visibility]));
  if (existingCommon && mappedCommonEntry) {
    visibility.set(mappedCommonEntry.slug, existingCommon.visibility);
  }
  for (const entry of bySlug.values())
    if (!existingSlugs.has(entry.slug)) visibility.set(entry.slug, entry.visibility);
  const resolved = new Map<string, { root: string; depth: number; private: boolean }>();
  for (const slug of parents.keys()) {
    const chain: string[] = [];
    let cursor: string | null = slug;
    while (cursor && parents.has(cursor) && !resolved.has(cursor)) {
      chain.push(cursor);
      cursor = parents.get(cursor) ?? null;
    }
    let ancestor = cursor ? resolved.get(cursor) : undefined;
    for (const node of chain.reverse()) {
      ancestor = {
        root: ancestor?.root ?? node,
        depth: (ancestor?.depth ?? 0) + 1,
        private: Boolean(ancestor?.private || visibility.get(node) === 'private'),
      };
      resolved.set(node, ancestor);
    }
  }
  let categoriesFlattened = 0;
  const promoted = new Set<string>();
  for (const entry of bySlug.values()) {
    if (existingSlugs.has(entry.slug)) continue;
    const original = resolved.get(entry.slug)!;
    if (original.depth > MAX_CATEGORY_DEPTH) {
      entry.parentSlug = original.root;
      if (original.private && visibility.get(original.root) !== 'private')
        entry.visibility = 'private';
      promoted.add(entry.slug);
      categoriesFlattened += 1;
    }
  }
  for (const row of existing) slugToId.set(row.slug, row.id);

  const existingMax = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1);
  const toCreate = [...bySlug.values()]
    .filter((entry) => !slugToId.has(entry.slug))
    .sort((a, b) => Number(promoted.has(a.slug)) - Number(promoted.has(b.slug)))
    .map((entry, index) => ({ ...entry, sortOrder: existingMax + 1 + index }));

  // 分两轮（先根/依赖已有父级，再依赖新建根的子分类）按块批量 INSERT，消除 2N 条逐条读写。
  let remaining = toCreate;
  while (remaining.length > 0) {
    const ready: typeof remaining = [];
    const deferred: typeof remaining = [];
    for (const entry of remaining) {
      const parentKnown =
        !entry.parentSlug || slugToId.has(entry.parentSlug) || !bySlug.has(entry.parentSlug);
      if (parentKnown) ready.push(entry);
      else deferred.push(entry);
    }
    const wave = ready.length > 0 ? ready : deferred;
    for (const batch of chunks(wave, CATEGORY_INSERT_CHUNK_SIZE)) {
      const created = await db
        .insert(categories)
        .values(
          batch.map((entry) => ({
            name: entry.name,
            slug: entry.slug,
            parentId: entry.parentSlug ? (slugToId.get(entry.parentSlug) ?? null) : null,
            icon: entry.icon,
            sortOrder: entry.sortOrder,
            visibility: entry.visibility,
          })),
        )
        .returning({ id: categories.id, slug: categories.slug });
      for (const row of created) slugToId.set(row.slug, row.id);
      log?.count('categoriesCreated', created.length);
    }
    remaining = ready.length > 0 ? deferred : [];
  }

  return {
    slugToId,
    categoriesFlattened,
    commonCategoryId: existingCommon?.id ?? null,
    backupHasSystemCommon,
  };
}

const liveKey = (categoryId: number | null, urlNormalized: string): string =>
  `${categoryId === null ? 'null' : categoryId}:${urlNormalized}`;

export async function importTransferData(
  db: Db,
  data: TransferData,
  strategy: ImportStrategy,
  log?: TransferLog,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    categoriesFlattened: 0,
    bookmarksCreated: 0,
    bookmarksSkipped: 0,
    bookmarksUpdated: 0,
    errors: [],
  };
  log?.phase('match');
  const existingRows = await readImportMatches(db, data);
  log?.count('matchedRecords', existingRows.length);
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const deletedByIdentity = new Map<string, number[]>();
  const deletedByUrlAndTime = new Map<string, number[]>();
  const deletedKey = (url: string, deletedAt: string, addedAt?: string | null) =>
    JSON.stringify([url, deletedAt, addedAt ?? null]);
  const addDeleted = (index: Map<string, number[]>, key: string, id: number) => {
    const ids = index.get(key);
    if (ids) ids.push(id);
    else index.set(key, [id]);
  };
  for (const row of existingRows) {
    if (row.deletedAt === null) continue;
    const normalized = row.urlNormalized || normalizeUrl(row.url);
    const identity = deletedKey(normalized, row.deletedAt, row.addedAt);
    const urlAndTime = deletedKey(normalized, row.deletedAt);
    addDeleted(deletedByIdentity, identity, row.id);
    addDeleted(deletedByUrlAndTime, urlAndTime, row.id);
  }
  // A deleted identity is a multiset: distinct records can share all timestamps.
  const consumedDeleted = new Set<number>();
  const takeDeleted = (normalized: string, bookmark: TransferBookmark): number | undefined => {
    const key = deletedKey(normalized, bookmark.deletedAt!, bookmark.addedAt);
    const ids = (bookmark.addedAt != null ? deletedByIdentity : deletedByUrlAndTime).get(key);
    while (ids?.length) {
      const id = ids.pop()!;
      if (!consumedDeleted.has(id)) {
        consumedDeleted.add(id);
        return id;
      }
    }
    return undefined;
  };
  const deletedMatches = new Map<number, number>();
  // Reserve exact identities before legacy entries can consume a broader match.
  // Only matching is reordered; inserts and updates retain the backup's order.
  for (const hasAddedAt of [true, false]) {
    for (const [index, bookmark] of data.bookmarks.entries()) {
      if (bookmark.deletedAt == null || (bookmark.addedAt != null) !== hasAddedAt) continue;
      const id = takeDeleted(normalizeUrl(bookmark.url), bookmark);
      if (id !== undefined) deletedMatches.set(index, id);
    }
  }
  log?.phase('categories');
  const categoryImport = await upsertCategoriesForImport(db, data, log);
  const categorySlugToId = categoryImport.slugToId;
  summary.categoriesFlattened = categoryImport.categoriesFlattened;
  const categoryRows = await db.all<{ id: number; effectiveVisibility: Visibility }>(sql`
    SELECT c.id, ${categoryEffectiveVisibility} AS effectiveVisibility FROM categories c
  `);
  const categoryPrivacy = new Map(categoryRows.map((item) => [item.id, item.effectiveVisibility]));
  const resolveCategoryId = (bookmark: TransferBookmark): number | null => {
    const id = bookmark.categorySlug ? categorySlugToId.get(bookmark.categorySlug) : undefined;
    return id ?? null;
  };

  // 非删除书签按「目标分类 + 规范化 URL」去重，支持同一 URL 存在于多个分类。
  const existing = new Map<string, number>();
  for (const row of existingRows) {
    if (row.deletedAt !== null) continue;
    const normalized = row.urlNormalized || normalizeUrl(row.url);
    existing.set(liveKey(row.categoryId ?? null, normalized), row.id);
  }

  type ImportEntry = {
    index: number;
    bookmark: TransferBookmark;
    categoryId: number | null;
    synthetic?: boolean;
  };
  const entriesToProcess: ImportEntry[] = data.bookmarks.map((bookmark, index) => ({
    index,
    bookmark,
    categoryId: resolveCategoryId(bookmark),
  }));
  if (!categoryImport.backupHasSystemCommon && categoryImport.commonCategoryId !== null) {
    const commonId = categoryImport.commonCategoryId;
    const commonPrivate = categoryPrivacy.get(commonId) === 'private';
    for (const [index, originalBookmark] of data.bookmarks.entries()) {
      if (
        originalBookmark.isPinned !== true ||
        originalBookmark.deletedAt != null ||
        originalBookmark.archivedAt != null
      ) {
        continue;
      }
      const sourceCategoryId = resolveCategoryId(originalBookmark);
      if (sourceCategoryId === commonId) continue;
      const sourceEffectivePrivate =
        originalBookmark.visibility === 'private' ||
        (sourceCategoryId !== null && categoryPrivacy.get(sourceCategoryId) === 'private');
      const syntheticVisibility: Visibility =
        sourceEffectivePrivate && !commonPrivate
          ? 'private'
          : (originalBookmark.visibility ?? 'private');
      entriesToProcess.push({
        index,
        bookmark: {
          ...originalBookmark,
          sortOrder: undefined,
          visibility: syntheticVisibility,
        },
        categoryId: commonId,
        synthetic: true,
      });
    }
  }

  const inserts: Array<{ bookmark: TransferBookmark; categoryId: number | null }> = [];
  const updates: Array<{ id: number; bookmark: TransferBookmark; categoryId: number | null }> = [];

  for (const entry of entriesToProcess) {
    let bookmark = entry.bookmark;
    const targetId = entry.categoryId;
    const normalized = normalizeUrl(bookmark.url);
    const isDeleted = bookmark.deletedAt !== undefined && bookmark.deletedAt !== null;
    const key = liveKey(targetId, normalized);
    const id = isDeleted ? deletedMatches.get(entry.index) : existing.get(key);
    if (id === -1) {
      if (!entry.synthetic) summary.bookmarksSkipped += 1;
      continue;
    }
    if (id !== undefined) {
      if (!isDeleted) existing.set(key, -1);
      if (entry.synthetic) continue;
      if (strategy === 'update') {
        if (bookmark.visibility === undefined) {
          const current = existingById.get(id)!;
          const losesProtection =
            current.effectiveVisibility === 'private' &&
            (targetId === null || categoryPrivacy.get(targetId) !== 'private');
          bookmark = { ...bookmark, visibility: losesProtection ? 'private' : current.visibility };
        }
        updates.push({ id, bookmark, categoryId: targetId });
        summary.bookmarksUpdated += 1;
      } else {
        summary.bookmarksSkipped += 1;
      }
      continue;
    }
    inserts.push({ bookmark, categoryId: targetId });
    if (!isDeleted) existing.set(key, -1);
    summary.bookmarksCreated += 1;
  }

  const existingBookmarkCategories = new Set<number | null>();
  const nextOrderByCategory = new Map<number | null, number>();
  if (inserts.length > 0) {
    const orderRows = await db.all<{ categoryId: number | null; maxOrder: number | null }>(sql`
      SELECT category_id AS categoryId, MAX(sort_order) AS maxOrder
      FROM bookmarks
      GROUP BY category_id
    `);
    for (const row of orderRows) {
      const key = row.categoryId ?? null;
      existingBookmarkCategories.add(key);
      nextOrderByCategory.set(key, Number(row.maxOrder ?? -1) + 1);
    }
  }
  const allocateSortOrder = (categoryId: number | null, explicit?: number): number => {
    const currentNext = nextOrderByCategory.get(categoryId) ?? 0;
    if (!existingBookmarkCategories.has(categoryId) && explicit !== undefined) {
      nextOrderByCategory.set(categoryId, Math.max(currentNext, explicit + 1));
      return explicit;
    }
    nextOrderByCategory.set(categoryId, currentNext + 1);
    return currentNext;
  };

  await withBookmarkTagWrites(
    db,
    async (replaceTags) => {
      for (const chunk of chunks(inserts, INSERT_CHUNK_SIZE)) {
        log?.phase('insert-bookmarks');
        const created = await db
          .insert(bookmarks)
          .values(
            chunk.map(({ bookmark, categoryId }) => ({
              title: bookmark.title,
              url: bookmark.url,
              description: bookmark.description ?? null,
              iconUrl: bookmark.iconUrl ?? null,
              sortOrder: allocateSortOrder(categoryId, bookmark.sortOrder),
              categoryId,
              visibility: bookmark.visibility ?? 'private',
              archivedAt: bookmark.archivedAt ?? null,
              deletedAt: bookmark.deletedAt ?? null,
              createdAt: bookmark.addedAt ?? undefined,
              urlNormalized: normalizeUrl(bookmark.url),
            })),
          )
          .returning({ id: bookmarks.id })
          .catch((error) => {
            log?.failure(error);
            throw error;
          });
        log?.count('bookmarksCreated', created.length);
        await replaceTags(
          created.map((row, index) => ({ bookmarkId: row.id, names: chunk[index].bookmark.tags })),
        );
      }
    },
    () => log?.phase('tags'),
  );

  await withBookmarkTagWrites(
    db,
    async (replaceTags) => {
      for (const chunk of chunks(updates, UPDATE_CHUNK_SIZE)) {
        log?.phase('update-bookmarks');
        const statements = chunk.map(({ id, bookmark, categoryId }) =>
          db
            .update(bookmarks)
            .set({
              title: bookmark.title,
              description: bookmark.description ?? null,
              iconUrl: bookmark.iconUrl ?? null,
              ...(bookmark.sortOrder !== undefined ? { sortOrder: bookmark.sortOrder } : {}),
              categoryId,
              ...(bookmark.visibility !== undefined ? { visibility: bookmark.visibility } : {}),
              archivedAt: bookmark.archivedAt ?? null,
              deletedAt: bookmark.deletedAt ?? null,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(bookmarks.id, id)),
        );
        await db
          .batch(statements as [(typeof statements)[number], ...typeof statements])
          .catch((error) => {
            log?.failure(error);
            throw error;
          });
        log?.count('bookmarksUpdated', chunk.length);
        await replaceTags(
          chunk.map(({ id, bookmark }) => ({ bookmarkId: id, names: bookmark.tags })),
        );
      }
    },
    () => log?.phase('tags'),
  );

  log?.count('bookmarksSkipped', summary.bookmarksSkipped);
  return summary;
}
