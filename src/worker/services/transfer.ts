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
