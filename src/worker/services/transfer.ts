import type { Bookmark } from '../../shared/api/types';
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
import {
  HTML_EXPORT_HEADER,
  serializeHtmlBookmark,
  serializeHtmlFolderEnd,
  serializeHtmlFolderStart,
} from '../transfer/html';
import { getBookmark, listExportBookmarks, normalizeUrl, replaceTagsBatch } from './bookmarks';
import { listCategories } from './categories';
import { ServiceError } from './errors';

// D1 limits the number of bound parameters per statement. Each bookmark insert
// currently binds eleven values (including category_id and visibility), so nine rows stay below
// the limit with headroom.
const INSERT_CHUNK_SIZE = 9;
const UPDATE_CHUNK_SIZE = 25;
const TAG_CHUNK_SIZE = 100;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function toTransferBookmark(bookmark: Bookmark): TransferBookmark {
  return {
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
  };
}

function streamText(chunks: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await chunks.return('');
    },
  });
}

type ExportCategory = Awaited<ReturnType<typeof listCategories>>[number];

async function* jsonExport(db: Db, categoriesList: ExportCategory[]): AsyncGenerator<string> {
  const idToSlug = new Map(categoriesList.map((category) => [category.id, category.slug]));
  const exportedCategories: TransferCategory[] = categoriesList.map((category) => ({
    name: category.name,
    visibility: category.visibility,
    slug: category.slug,
    icon: category.icon,
    parentSlug: category.parentId !== null ? (idToSlug.get(category.parentId) ?? null) : null,
  }));
  yield `{"version":2,"exportedAt":${JSON.stringify(new Date().toISOString())},"categories":${JSON.stringify(exportedCategories)},"bookmarks":[`;
  let cursor: string | undefined;
  let first = true;
  do {
    const page = await listExportBookmarks(db, cursor);
    if (page.items.length > 0) {
      yield `${first ? '' : ','}${page.items.map((bookmark) => JSON.stringify(toTransferBookmark(bookmark))).join(',')}`;
      first = false;
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  yield ']}\n';
}

async function* htmlExport(db: Db, categoriesList: ExportCategory[]): AsyncGenerator<string> {
  type Node = { category: ExportCategory; children: Node[] };
  const nodes = new Map(
    categoriesList.map((category) => [category.id, { category, children: [] as Node[] }]),
  );
  const roots: Node[] = [];
  for (const category of categoriesList) {
    const node = nodes.get(category.id)!;
    const parent = category.parentId === null ? undefined : nodes.get(category.parentId);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  async function* folder(node: Node, indent: string): AsyncGenerator<string> {
    yield `${serializeHtmlFolderStart(node.category.name, indent)}\n`;
    let cursor: string | undefined;
    do {
      const page = await listExportBookmarks(db, cursor, node.category.id);
      if (page.items.length > 0) {
        yield `${page.items.map((bookmark) => serializeHtmlBookmark(toTransferBookmark(bookmark), `${indent}    `)).join('\n')}\n`;
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    for (const child of node.children) yield* folder(child, `${indent}    `);
    yield `${serializeHtmlFolderEnd(indent)}\n`;
  }

  yield `${HTML_EXPORT_HEADER}\n`;
  for (const root of roots) yield* folder(root, '    ');

  let cursor: string | undefined;
  let opened = false;
  do {
    const page = await listExportBookmarks(db, cursor, null);
    if (page.items.length > 0) {
      if (!opened) {
        yield `${serializeHtmlFolderStart('未分类', '    ')}\n`;
        opened = true;
      }
      yield `${page.items.map((bookmark) => serializeHtmlBookmark(toTransferBookmark(bookmark), '        ')).join('\n')}\n`;
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  if (opened) yield `${serializeHtmlFolderEnd('    ')}\n`;
  yield '</DL><p>\n';
}

export async function exportTransferStream(
  db: Db,
  format: 'json' | 'html',
): Promise<ReadableStream<Uint8Array>> {
  const categoriesList = await listCategories(db, true);
  return streamText(
    format === 'json' ? jsonExport(db, categoriesList) : htmlExport(db, categoriesList),
  );
}

/** 按 slug 建立分类映射并补齐缺失分类，返回 slug → id 映射。 */
async function upsertCategoriesForImport(db: Db, data: TransferData): Promise<Map<string, number>> {
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
    .select({
      id: bookmarks.id,
      urlNormalized: bookmarks.urlNormalized,
      url: bookmarks.url,
      addedAt: bookmarks.createdAt,
      deletedAt: bookmarks.deletedAt,
    })
    .from(bookmarks);
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
  const categorySlugToId = await upsertCategoriesForImport(db, data);
  const categoryPrivacy = new Map(
    (await listCategories(db, true)).map((item) => [item.id, item.effectiveVisibility]),
  );
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
    if (!isDeleted) existing.set(normalized, -1);
    summary.bookmarksCreated += 1;
  }

  let tagWrites: Array<{ bookmarkId: number; names: string[] | undefined }> = [];
  async function flushTagWrites() {
    if (tagWrites.length === 0) return;
    const pending = tagWrites;
    tagWrites = [];
    await replaceTagsBatch(db, pending);
  }
  async function queueTagWrites(entries: typeof tagWrites) {
    if (tagWrites.length + entries.length > TAG_CHUNK_SIZE) await flushTagWrites();
    tagWrites.push(...entries);
  }

  try {
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
      await queueTagWrites(
        created.map((row, index) => ({ bookmarkId: row.id, names: chunk[index].tags })),
      );
    }
  } finally {
    await flushTagWrites();
  }

  try {
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
      await queueTagWrites(
        chunk.map(({ id, bookmark }) => ({ bookmarkId: id, names: bookmark.tags })),
      );
    }
  } finally {
    await flushTagWrites();
  }

  return summary;
}
