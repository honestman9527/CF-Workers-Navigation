import type { Visibility } from '../../shared/api/types';
import type { TransferLog } from '../observability';
import type { ExportFormat, TransferBookmark, TransferCategory } from '../transfer/types';
import type { Db } from '../types';

import { sql } from 'drizzle-orm';

import { decodeListCursor, encodeListCursor } from '../cursor';
import {
  HTML_EXPORT_HEADER,
  serializeHtmlBookmark,
  serializeHtmlFolderEnd,
  serializeHtmlFolderStart,
} from '../transfer/html';

const EXPORT_PAGE_SIZE = 300;

type ExportCategory = {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  icon: string | null;
  visibility: Visibility;
};

type ExportBookmarkRow = {
  id: number;
  created_at: string;
  title: string;
  visibility: Visibility;
  url: string;
  description: string | null;
  icon_url: string | null;
  is_pinned: number;
  category_slug: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  tag_names: string;
};

function readExportCategories(db: Db): Promise<ExportCategory[]> {
  return db.all<ExportCategory>(sql`
    SELECT id, parent_id AS parentId, name, slug, icon, visibility FROM categories
    ORDER BY sort_order, name COLLATE NOCASE, id
  `);
}

/** 启动前确认分类可读；不预扫描书签分页，也不保证后续下载成功。 */
export async function prepareTransferExport(db: Db, log?: TransferLog): Promise<void> {
  log?.phase('categories');
  try {
    const categoriesList = await readExportCategories(db);
    log?.count('categoriesRead', categoriesList.length);
    log?.finish('success');
  } catch (error) {
    log?.finish('failed', error);
    throw error;
  }
}

function toTransferBookmark(row: ExportBookmarkRow): TransferBookmark {
  // SQLite's json_group_array always produces JSON; the null entry of an
  // untagged bookmark must not escape into the backup's tag list.
  const names: unknown = JSON.parse(row.tag_names);
  return {
    title: row.title,
    visibility: row.visibility,
    url: row.url,
    description: row.description,
    iconUrl: row.icon_url,
    isPinned: Boolean(row.is_pinned),
    categorySlug: row.category_slug,
    tags: Array.isArray(names)
      ? names.filter((name): name is string => typeof name === 'string')
      : [],
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    addedAt: row.created_at,
  };
}

/** 全状态有界读取；分类只匹配直属书签，不计算交互计数或有效权限。 */
async function readExportPage(
  db: Db,
  cursorValue?: string,
  categoryId?: number | null,
  log?: TransferLog,
): Promise<{ items: TransferBookmark[]; nextCursor: string | null }> {
  const cursor = decodeListCursor(cursorValue);
  const categoryCondition =
    categoryId === undefined
      ? sql`1 = 1`
      : categoryId === null
        ? sql`b.category_id IS NULL`
        : sql`b.category_id = ${categoryId}`;
  const cursorCondition = cursor
    ? sql`AND (b.created_at < ${cursor.createdAt} OR (b.created_at = ${cursor.createdAt} AND b.id < ${cursor.id}))`
    : sql``;
  const rows = await db.all<ExportBookmarkRow>(sql`
    WITH bookmark_page AS MATERIALIZED (
      SELECT b.id FROM bookmarks b
      WHERE ${categoryCondition} ${cursorCondition}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT ${EXPORT_PAGE_SIZE + 1}
    )
    SELECT b.id, b.created_at, b.title, b.visibility, b.url, b.description,
      b.icon_url, b.is_pinned, c.slug AS category_slug, b.archived_at, b.deleted_at,
      COALESCE(json_group_array(CASE WHEN t.id IS NULL THEN NULL ELSE t.name END), '[]') AS tag_names
    FROM bookmarks b
    INNER JOIN bookmark_page page ON page.id = b.id
    LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
    LEFT JOIN tags t ON t.id = bt.tag_id
    LEFT JOIN categories c ON c.id = b.category_id
    GROUP BY b.id
    ORDER BY b.created_at DESC, b.id DESC
  `);
  const hasMore = rows.length > EXPORT_PAGE_SIZE;
  log?.count('bookmarksRead', Math.min(rows.length, EXPORT_PAGE_SIZE));
  const last = rows[EXPORT_PAGE_SIZE - 1];
  return {
    items: (hasMore ? rows.slice(0, EXPORT_PAGE_SIZE) : rows).map(toTransferBookmark),
    nextCursor:
      hasMore && last ? encodeListCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

function streamText(chunks: AsyncGenerator<string>, log?: TransferLog): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (cancelled) return;
        if (done) {
          log?.finish('success');
          controller.close();
        } else controller.enqueue(encoder.encode(value));
      } catch (error) {
        if (cancelled) return;
        log?.finish('failed', error);
        controller.error(error);
      }
    },
    async cancel() {
      cancelled = true;
      log?.finish('cancelled');
      await chunks.return('');
    },
  });
}

async function* jsonExport(
  db: Db,
  categoriesList: ExportCategory[],
  log?: TransferLog,
): AsyncGenerator<string> {
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
    const page = await readExportPage(db, cursor, undefined, log);
    if (page.items.length > 0) {
      yield `${first ? '' : ','}${page.items.map((bookmark) => JSON.stringify(bookmark)).join(',')}`;
      first = false;
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  yield ']}\n';
}

async function* htmlExport(
  db: Db,
  categoriesList: ExportCategory[],
  log?: TransferLog,
): AsyncGenerator<string> {
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
      const page = await readExportPage(db, cursor, node.category.id, log);
      if (page.items.length > 0) {
        yield `${page.items.map((bookmark) => serializeHtmlBookmark(bookmark, `${indent}    `)).join('\n')}\n`;
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
    const page = await readExportPage(db, cursor, null, log);
    if (page.items.length > 0) {
      if (!opened) {
        yield `${serializeHtmlFolderStart('未分类', '    ')}\n`;
        opened = true;
      }
      yield `${page.items.map((bookmark) => serializeHtmlBookmark(bookmark, '        ')).join('\n')}\n`;
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  if (opened) yield `${serializeHtmlFolderEnd('    ')}\n`;
  yield '</DL><p>\n';
}

export async function exportTransferStream(
  db: Db,
  format: ExportFormat,
  log?: TransferLog,
): Promise<ReadableStream<Uint8Array>> {
  log?.format(format);
  log?.phase('categories');
  try {
    const categoriesList = await readExportCategories(db);
    log?.count('categoriesRead', categoriesList.length);
    log?.phase('stream');
    return streamText(
      format === 'json' ? jsonExport(db, categoriesList, log) : htmlExport(db, categoriesList, log),
      log,
    );
  } catch (error) {
    log?.finish('failed', error);
    throw error;
  }
}
