import type {
  ImportStrategy,
  ImportSummary,
  TransferBookmark,
  TransferCategory,
  TransferData,
} from '../transfer/types';
import type { AppEnv } from '../types';

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { getDb } from '../db';
import { jsonError } from '../errors';
import { bookmarks, categories, type Bookmark, type NewBookmark } from '../schema';
import { detectFormat } from '../transfer/detect';
import { parseHtml, serializeHtml } from '../transfer/html';
import { parseJson, serializeJson } from '../transfer/json';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const BOOKMARK_INSERT_CHUNK_SIZE = 12;
const BOOKMARK_UPDATE_BATCH_SIZE = 25;

const formatQuerySchema = z.enum(['html', 'json', 'auto']);
const strategyQuerySchema = z.enum(['skip', 'create', 'update']).default('skip');

const transferRoutes = new Hono<AppEnv>();

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

async function loadImportIndex(env: AppEnv['Bindings']): Promise<ImportIndex> {
  const db = getDb(env);
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

async function loadExportData(env: AppEnv['Bindings']): Promise<TransferData> {
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

function timestampForFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

transferRoutes.get('/export', async (c) => {
  const format = formatQuerySchema.parse(c.req.query('format'));
  if (format === 'auto') {
    return jsonError(c, 400, 'validation_error', '导出不支持自动识别，请指定 html 或 json');
  }
  const data = await loadExportData(c.env);

  if (format === 'json') {
    return new Response(serializeJson(data), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="nav-export-${timestampForFilename()}.json"`,
      },
    });
  }

  return new Response(serializeHtml(data), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="nav-export-${timestampForFilename()}.html"`,
    },
  });
});

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateUniqueSlug(index: ImportIndex, name: string): string {
  const base = slugifyName(name) || `cat-${Math.random().toString(36).slice(2, 10)}`;
  if (!index.slugs.has(base)) {
    return base;
  }
  let counter = 2;
  for (;;) {
    const candidate = `${base}-${counter}`;
    if (!index.slugs.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

async function importCategory(
  env: AppEnv['Bindings'],
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
    const slug = generateUniqueSlug(index, category.slug ?? category.name);
    const db = getDb(env);
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

  await importBookmarks(env, index, category.bookmarks, categoryId, strategy, summary);

  for (const child of category.children) {
    await importCategory(env, index, child, categoryId, strategy, summary);
  }
}

async function importBookmarks(
  env: AppEnv['Bindings'],
  index: ImportIndex,
  transferBookmarks: TransferBookmark[],
  categoryId: number,
  strategy: ImportStrategy,
  summary: ImportSummary,
): Promise<void> {
  const db = getDb(env);
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

function filenameFromContentType(contentType: string): string {
  if (contentType.includes('application/json')) {
    return 'import.json';
  }
  if (contentType.includes('text/html')) {
    return 'import.html';
  }
  return 'import.bin';
}

transferRoutes.post('/import', async (c) => {
  const requestedFormat = formatQuerySchema.parse(c.req.query('format'));
  const strategy: ImportStrategy = strategyQuerySchema.parse(c.req.query('strategy'));

  const body = await c.req.text();
  if (new TextEncoder().encode(body).byteLength > MAX_IMPORT_BYTES) {
    return jsonError(c, 413, 'too_large', `文件过大（超过 ${MAX_IMPORT_BYTES / 1024 / 1024}MB）`);
  }

  let format: 'html' | 'json';
  try {
    format =
      requestedFormat === 'auto'
        ? detectFormat(filenameFromContentType(c.req.header('Content-Type') ?? ''), body)
        : requestedFormat;
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法识别文件格式';
    return jsonError(c, 400, 'validation_error', message);
  }

  let data: TransferData;
  try {
    data = format === 'json' ? parseJson(body) : parseHtml(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析失败';
    return jsonError(c, 400, 'validation_error', message);
  }

  const summary: ImportSummary = {
    categoriesCreated: 0,
    categoriesReused: 0,
    bookmarksCreated: 0,
    bookmarksSkipped: 0,
    bookmarksUpdated: 0,
    errors: [],
  };

  try {
    const index = await loadImportIndex(c.env);
    for (const category of data.categories) {
      await importCategory(c.env, index, category, null, strategy, summary);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败';
    return jsonError(c, 500, 'internal_error', message);
  }

  return c.json(summary, 200);
});

export default transferRoutes;
