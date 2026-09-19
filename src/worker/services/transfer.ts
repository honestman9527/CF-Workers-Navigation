import type {
  ImportStrategy,
  ImportSummary,
  TransferBookmark,
  TransferCategory,
  TransferData,
} from '../transfer/types';
import type { Db } from '../types';

import { eq, sql } from 'drizzle-orm';

import { UNCATEGORIZED_SLUG, type Visibility } from '../../shared/api/types';
import { bookmarks, categories } from '../schema';
import { slugify } from '../slug';
import { getBookmark, listBookmarks, normalizeUrl, replaceTags } from './bookmarks';
import { listCategories } from './categories';
import { ServiceError } from './errors';

// D1 limits the number of bound parameters per statement. Each bookmark insert
// currently binds eleven values (including category_id and visibility), so nine rows stay below
// the limit with headroom.
const INSERT_CHUNK_SIZE = 9;
const UPDATE_CHUNK_SIZE = 25;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function exportTransferData(db: Db): Promise<TransferData> {
  const categoriesList = await listCategories(db, true);
  const idToSlug = new Map(categoriesList.map((category) => [category.id, category.slug]));
  const exportedCategories: TransferCategory[] = categoriesList.map((category) => ({
    name: category.name,
    visibility: category.visibility,
    slug: category.slug,
    icon: category.icon,
    parentSlug: category.parentId !== null ? (idToSlug.get(category.parentId) ?? null) : null,
  }));

  const exported: TransferBookmark[] = [];
  let cursor: string | undefined;
  do {
    const page = await listBookmarks(db, { view: 'all', cursor, limit: 100 }, true);
    exported.push(
      ...page.items.map((bookmark) => ({
        title: bookmark.title,
        visibility: bookmark.visibility,
        url: bookmark.url,
        description: bookmark.description,
        iconUrl: bookmark.iconUrl,
        isPinned: bookmark.isPinned,
        categorySlug: bookmark.categorySlug,
        tags: bookmark.tags,
        archivedAt: bookmark.archivedAt,
        deletedAt: bookmark.deletedAt,
        addedAt: bookmark.createdAt,
      })),
    );
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    categories: exportedCategories,
    bookmarks: exported,
  };
}

/** 按 slug 建立分类映射并补齐缺失分类，返回 slug → id 映射。 */
async function upsertCategoriesForImport(
  db: Db,
  transferCategories: TransferCategory[] | undefined,
  strictReferences: boolean,
): Promise<Map<string, number>> {
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
  for (const raw of transferCategories ?? []) {
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
    .select({ id: categories.id, slug: categories.slug, parentId: categories.parentId })
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
  if (strictReferences) {
    for (const entry of bySlug.values()) {
      if (entry.parentSlug && !parents.has(entry.parentSlug))
        throw new ServiceError(400, 'validation_error', '备份引用了不存在的父分类');
    }
  }
  for (const slug of parents.keys()) {
    const seen = new Set<string>();
    let current: string | null = slug;
    while (current && parents.has(current)) {
      if (seen.has(current))
        throw new ServiceError(400, 'validation_error', '分类层级不能形成循环');
      seen.add(current);
      current = parents.get(current) ?? null;
    }
  }
  for (const row of existing) slugToId.set(row.slug, row.id);

  let sortOrder = 0;
  for (const entry of bySlug.values()) {
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

  return slugToId;
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
  const categorySlugToId = await upsertCategoriesForImport(db, data.categories, data.version === 2);
  const categoryPrivacy = new Map(
    (await listCategories(db, true)).map((item) => [item.id, item.effectiveVisibility]),
  );
  const resolveCategoryId = (bookmark: TransferBookmark): number | null => {
    const id = bookmark.categorySlug ? categorySlugToId.get(bookmark.categorySlug) : undefined;
    if (data.version === 2 && bookmark.categorySlug && id === undefined)
      throw new ServiceError(400, 'validation_error', '备份引用了不存在的分类');
    return id ?? null;
  };
  const inserts: TransferBookmark[] = [];
  const updates: Array<{ id: number; bookmark: TransferBookmark }> = [];

  for (let bookmark of data.bookmarks) {
    resolveCategoryId(bookmark);
    const normalized = normalizeUrl(bookmark.url);
    const id = existing.get(normalized);
    if (id === -1) {
      summary.bookmarksSkipped += 1;
      continue;
    }
    if (id !== undefined) {
      if (strategy === 'update') {
        if (bookmark.visibility === undefined) {
          const current = await getBookmark(db, id, true);
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
          categoryId: resolveCategoryId(bookmark),
          visibility: bookmark.visibility ?? 'private',
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
          categoryId: resolveCategoryId(bookmark),
          ...(bookmark.visibility !== undefined ? { visibility: bookmark.visibility } : {}),
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
