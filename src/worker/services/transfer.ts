import type { TransferLog } from '../observability';
import type {
  ImportStrategy,
  ImportSummary,
  TransferBookmark,
  TransferData,
} from '../transfer/types';
import type { Db } from '../types';

import { eq, sql, inArray } from 'drizzle-orm';

import { UNCATEGORIZED_SLUG, type Visibility } from '../../shared/api/types';
import { MAX_CATEGORY_DEPTH } from '../../shared/category-rules';
import { bookmarks, categories } from '../schema';
import { slugify } from '../slug';
import { bookmarkEffectiveVisibility, categoryEffectiveVisibility } from '../visibility';
import { withBookmarkTagWrites } from './bookmark-tags';
import { normalizeUrl } from './bookmarks';
import { ServiceError } from './errors';

// D1 limits the number of bound parameters per statement. Each bookmark insert
// currently binds eleven values (including category_id and visibility), so nine rows stay below
// the limit with headroom.
const INSERT_CHUNK_SIZE = 9;
const UPDATE_CHUNK_SIZE = 25;
const MATCH_CHUNK_SIZE = 90;

type ImportMatch = {
  id: number;
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
  const projection = sql`SELECT b.id, b.url_normalized AS urlNormalized, b.url,
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

/** 按 slug 建立分类映射并补齐缺失分类，返回 slug → id 映射。 */
async function upsertCategoriesForImport(
  db: Db,
  data: TransferData,
  log?: TransferLog,
): Promise<{ slugToId: Map<string, number>; categoriesFlattened: number }> {
  const slugToId = new Map<string, number>();

  const bySlug = new Map<
    string,
    {
      name: string;
      slug: string;
      icon: string | null;
      parentSlug: string | null;
      visibility: Visibility;
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
    })
    .from(categories);
  // Existing categories retain their hierarchy and privacy when reused.
  const existingSlugs = new Set(existing.map((row) => row.slug));
  const idToSlug = new Map(existing.map((row) => [row.id, row.slug]));
  const parents = new Map(
    existing.map((row) => [
      row.slug,
      row.parentId === null ? null : (idToSlug.get(row.parentId) ?? null),
    ]),
  );
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

  let sortOrder = 0;
  const entries = [...bySlug.values()].sort(
    (a, b) => Number(promoted.has(a.slug)) - Number(promoted.has(b.slug)),
  );
  const existingMax = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1);
  sortOrder = existingMax + 1;
  for (const entry of entries) {
    if (slugToId.has(entry.slug)) continue;
    const [created] = await db
      .insert(categories)
      .values({
        name: entry.name,
        slug: entry.slug,
        icon: entry.icon,
        sortOrder,
        visibility: entry.visibility,
      })
      .returning({ id: categories.id });
    slugToId.set(entry.slug, created.id);
    log?.count('categoriesCreated', 1);
    sortOrder += 1;
  }

  const parentUpdates = [...bySlug.values()].flatMap((entry) => {
    if (!entry.parentSlug || existingSlugs.has(entry.slug)) return [];
    const id = slugToId.get(entry.slug);
    if (id === undefined) return [];
    const parentId = slugToId.get(entry.parentSlug) ?? null;
    return [
      db
        .update(categories)
        .set({ parentId, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(categories.id, id)),
    ];
  });
  if (parentUpdates.length > 0) {
    await db.batch(parentUpdates as [(typeof parentUpdates)[number], ...typeof parentUpdates]);
  }

  return { slugToId, categoriesFlattened };
}

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
  const existing = new Map<string, number>();
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
    const normalized = row.urlNormalized || normalizeUrl(row.url);
    if (row.deletedAt === null) {
      existing.set(normalized, row.id);
      continue;
    }
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
  const inserts: TransferBookmark[] = [];
  const updates: Array<{ id: number; bookmark: TransferBookmark }> = [];

  for (const [index, originalBookmark] of data.bookmarks.entries()) {
    let bookmark = originalBookmark;
    const normalized = normalizeUrl(bookmark.url);
    const isDeleted = bookmark.deletedAt !== undefined && bookmark.deletedAt !== null;
    const id = isDeleted ? deletedMatches.get(index) : existing.get(normalized);
    if (id === -1) {
      summary.bookmarksSkipped += 1;
      continue;
    }
    if (id !== undefined) {
      if (!isDeleted) existing.set(normalized, -1);
      if (strategy === 'update') {
        if (bookmark.visibility === undefined) {
          const current = existingById.get(id)!;
          const targetId = resolveCategoryId(bookmark);
          const losesProtection =
            current.effectiveVisibility === 'private' &&
            (targetId === null || categoryPrivacy.get(targetId) !== 'private');
          bookmark = { ...bookmark, visibility: losesProtection ? 'private' : current.visibility };
        }
        updates.push({ id, bookmark });
        summary.bookmarksUpdated += 1;
      } else {
        summary.bookmarksSkipped += 1;
      }
      continue;
    }
    inserts.push(bookmark);
    if (!isDeleted) existing.set(normalized, -1);
    summary.bookmarksCreated += 1;
  }

  await withBookmarkTagWrites(
    db,
    async (replaceTags) => {
      for (const chunk of chunks(inserts, INSERT_CHUNK_SIZE)) {
        log?.phase('insert-bookmarks');
        const created = await db
          .insert(bookmarks)
          .values(
            chunk.map((bookmark) => ({
              title: bookmark.title,
              url: bookmark.url,
              description: bookmark.description ?? null,
              iconUrl: bookmark.iconUrl ?? null,
              isPinned: bookmark.isPinned ?? false,
              categoryId: resolveCategoryId(bookmark),
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
          created.map((row, index) => ({ bookmarkId: row.id, names: chunk[index].tags })),
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
        const statements = chunk.map(({ id, bookmark }) =>
          db
            .update(bookmarks)
            .set({
              title: bookmark.title,
              description: bookmark.description ?? null,
              iconUrl: bookmark.iconUrl ?? null,
              isPinned: bookmark.isPinned ?? false,
              categoryId: resolveCategoryId(bookmark),
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
