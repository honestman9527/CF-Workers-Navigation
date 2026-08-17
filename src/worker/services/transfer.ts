import type {
  ImportStrategy,
  ImportSummary,
  TransferBookmark,
  TransferCategory,
  TransferData,
} from '../transfer/types';
import type { Bindings } from '../types';

import { eq } from 'drizzle-orm';

import { getDb } from '../db';
import { bookmarks, categories, type Bookmark, type NewBookmark } from '../schema';
import { uniqueSlug } from '../slug';

const BOOKMARK_INSERT_CHUNK_SIZE = 12;
const BOOKMARK_UPDATE_BATCH_SIZE = 25;

type Db = ReturnType<typeof getDb>;

type ImportIndex = {
  categoryByKey: Map<string, number>;
  slugs: Set<string>;
  bookmarkUrls: Set<string>;
};

function categoryKey(parentId: number | null, name: string): string {
  return `${parentId ?? 'root'}\0${name}`;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function toBookmarkValues(bookmark: TransferBookmark, categoryId: number): NewBookmark {
  return {
    categoryId,
    title: bookmark.title,
    url: bookmark.url,
    description: bookmark.description ?? null,
    iconUrl: bookmark.iconUrl ?? null,
    isPinned: bookmark.isPinned ?? false,
    sortOrder: bookmark.sortOrder ?? 0,
  };
}

export async function exportTransferData(env: Bindings): Promise<TransferData> {
  const db = getDb(env);
  const categoryRows = await db
    .select()
    .from(categories)
    .orderBy(categories.sortOrder, categories.id);
  const bookmarkRows =
    categoryRows.length === 0
      ? []
      : await db.select().from(bookmarks).orderBy(bookmarks.sortOrder, bookmarks.id);

  const nodes = new Map<number, TransferCategory>();
  const roots: TransferCategory[] = [];

  for (const row of categoryRows) {
    nodes.set(row.id, {
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      sortOrder: row.sortOrder,
      children: [],
      bookmarks: [],
    });
  }

  const bookmarksByCategory = new Map<number, Bookmark[]>();
  for (const bookmark of bookmarkRows) {
    const list = bookmarksByCategory.get(bookmark.categoryId) ?? [];
    list.push(bookmark);
    bookmarksByCategory.set(bookmark.categoryId, list);
  }

  for (const row of categoryRows) {
    const node = nodes.get(row.id)!;
    const rows = bookmarksByCategory.get(row.id) ?? [];
    node.bookmarks = rows.map((bookmark) => ({
      title: bookmark.title,
      url: bookmark.url,
      description: bookmark.description,
      iconUrl: bookmark.iconUrl,
      isPinned: bookmark.isPinned,
      sortOrder: bookmark.sortOrder,
      addedAt: bookmark.createdAt,
    }));

    if (row.parentId === null) {
      roots.push(node);
    } else {
      nodes.get(row.parentId)?.children.push(node);
    }
  }

  return { exportedAt: new Date().toISOString(), categories: roots };
}

async function loadImportIndex(db: Db): Promise<ImportIndex> {
  const categoryRows = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      slug: categories.slug,
    })
    .from(categories);
  const bookmarkRows = await db.select({ url: bookmarks.url }).from(bookmarks);

  const categoryByKey = new Map<string, number>();
  const slugs = new Set<string>();
  for (const row of categoryRows) {
    categoryByKey.set(categoryKey(row.parentId, row.name), row.id);
    if (row.slug) {
      slugs.add(row.slug);
    }
  }

  const bookmarkUrls = new Set<string>();
  for (const row of bookmarkRows) {
    bookmarkUrls.add(row.url);
  }

  return { categoryByKey, slugs, bookmarkUrls };
}

async function importCategory(
  db: Db,
  index: ImportIndex,
  category: TransferCategory,
  parentId: number | null,
  strategy: ImportStrategy,
  summary: ImportSummary,
): Promise<void> {
  const key = categoryKey(parentId, category.name);
  let categoryId = index.categoryByKey.get(key);

  if (categoryId !== undefined) {
    summary.categoriesReused += 1;
  } else {
    const slug = uniqueSlug(category.slug ?? category.name, index.slugs);
    const [created] = await db
      .insert(categories)
      .values({
        name: category.name,
        slug,
        parentId,
        icon: category.icon ?? null,
        sortOrder: category.sortOrder ?? 0,
      })
      .returning({ id: categories.id });
    categoryId = created.id;
    index.categoryByKey.set(key, categoryId);
    index.slugs.add(slug);
    summary.categoriesCreated += 1;
  }

  await importBookmarks(db, index, category.bookmarks, categoryId, strategy, summary);

  for (const child of category.children) {
    await importCategory(db, index, child, categoryId, strategy, summary);
  }
}

async function importBookmarks(
  db: Db,
  index: ImportIndex,
  transferBookmarks: TransferBookmark[],
  categoryId: number,
  strategy: ImportStrategy,
  summary: ImportSummary,
): Promise<void> {
  const inserts: NewBookmark[] = [];
  const updates: TransferBookmark[] = [];

  for (const bookmark of transferBookmarks) {
    const exists = index.bookmarkUrls.has(bookmark.url);

    if (exists) {
      if (strategy === 'skip') {
        summary.bookmarksSkipped += 1;
        continue;
      }

      if (strategy === 'update') {
        updates.push(bookmark);
        summary.bookmarksUpdated += 1;
        continue;
      }

      inserts.push(toBookmarkValues(bookmark, categoryId));
      index.bookmarkUrls.add(bookmark.url);
      summary.bookmarksCreated += 1;
      continue;
    }

    inserts.push(toBookmarkValues(bookmark, categoryId));
    index.bookmarkUrls.add(bookmark.url);
    summary.bookmarksCreated += 1;
  }

  for (const chunk of chunks(inserts, BOOKMARK_INSERT_CHUNK_SIZE)) {
    await db.insert(bookmarks).values(chunk);
  }

  for (const chunk of chunks(updates, BOOKMARK_UPDATE_BATCH_SIZE)) {
    const updateStatements = chunk.map((bookmark) =>
      db
        .update(bookmarks)
        .set({
          categoryId,
          title: bookmark.title,
          description: bookmark.description ?? null,
          iconUrl: bookmark.iconUrl ?? null,
          isPinned: bookmark.isPinned ?? false,
          sortOrder: bookmark.sortOrder ?? 0,
        })
        .where(eq(bookmarks.url, bookmark.url)),
    );
    await db.batch(
      updateStatements as [(typeof updateStatements)[number], ...typeof updateStatements],
    );
  }
}

export async function importTransferData(
  env: Bindings,
  data: TransferData,
  strategy: ImportStrategy,
): Promise<ImportSummary> {
  const db = getDb(env);
  const summary: ImportSummary = {
    categoriesCreated: 0,
    categoriesReused: 0,
    bookmarksCreated: 0,
    bookmarksSkipped: 0,
    bookmarksUpdated: 0,
    errors: [],
  };

  const index = await loadImportIndex(db);
  for (const category of data.categories) {
    await importCategory(db, index, category, null, strategy, summary);
  }

  return summary;
}
