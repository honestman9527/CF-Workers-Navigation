import type { TransferBookmark, TransferCategory, TransferData } from './types';

const UNNAMED_CATEGORY = '未命名分类';
const UNNAMED_BOOKMARK = '未命名书签';
const UNCATEGORIZED = '未分类书签';

function syntaxError(input: string, error: SyntaxError): never {
  const positionMatch = error.message.match(/position (\d+)/);
  const position = positionMatch ? Number(positionMatch[1]) : 0;
  const before = input.slice(0, position);
  const line = before.split(/\r?\n/).length;
  const column = position - before.lastIndexOf('\n');
  throw new Error(`JSON 格式有误：第 ${line} 行 第 ${column} 列（${error.message}）`);
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^[a-z]+:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function normalizeBookmark(raw: unknown, index: number, errors: string[]): TransferBookmark | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`第 ${index + 1} 个书签不是对象，已跳过`);
    return null;
  }
  const record = raw as Record<string, unknown>;
  const url = normalizeUrl(record.url);
  if (!url) {
    errors.push(`第 ${index + 1} 个书签缺少 url，已跳过`);
    return null;
  }
  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : UNNAMED_BOOKMARK;
  const description =
    typeof record.description === 'string'
      ? record.description
      : record.description === null
        ? null
        : undefined;
  const iconUrl =
    typeof record.iconUrl === 'string' && record.iconUrl.trim() ? record.iconUrl.trim() : null;
  const isPinned = typeof record.isPinned === 'boolean' ? record.isPinned : undefined;
  const sortOrder =
    typeof record.sortOrder === 'number' && Number.isFinite(record.sortOrder)
      ? record.sortOrder
      : undefined;
  const addedAt = typeof record.addedAt === 'string' ? record.addedAt : null;

  return { title, url, description, iconUrl, isPinned, sortOrder, addedAt };
}

function normalizeCategory(raw: unknown, index: number, errors: string[]): TransferCategory | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`第 ${index + 1} 个分类不是对象，已跳过`);
    return null;
  }
  const record = raw as Record<string, unknown>;
  const name =
    typeof record.name === 'string' && record.name.trim() ? record.name.trim() : UNNAMED_CATEGORY;
  const slug =
    typeof record.slug === 'string' && record.slug.trim() ? record.slug.trim() : undefined;
  const icon = typeof record.icon === 'string' && record.icon.trim() ? record.icon.trim() : null;
  const sortOrder =
    typeof record.sortOrder === 'number' && Number.isFinite(record.sortOrder)
      ? record.sortOrder
      : undefined;

  const childrenRaw = Array.isArray(record.children) ? record.children : [];
  const bookmarksRaw = Array.isArray(record.bookmarks) ? record.bookmarks : [];

  const children = childrenRaw
    .map((child, i) => normalizeCategory(child, i, errors))
    .filter((child): child is TransferCategory => child !== null);
  const bookmarks = bookmarksRaw
    .map((bookmark, i) => normalizeBookmark(bookmark, i, errors))
    .filter((bookmark): bookmark is TransferBookmark => bookmark !== null);

  return { name, slug, icon, sortOrder, children, bookmarks };
}

export function parseJson(input: string): TransferData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    if (error instanceof SyntaxError) {
      syntaxError(input, error);
    }
    throw error;
  }

  const errors: string[] = [];
  let categories: TransferCategory[] = [];

  if (Array.isArray(parsed)) {
    categories = parsed
      .map((entry, i) => normalizeCategory(entry, i, errors))
      .filter((category): category is TransferCategory => category !== null);
  } else if (parsed !== null && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.categories)) {
      categories = record.categories
        .map((entry, i) => normalizeCategory(entry, i, errors))
        .filter((category): category is TransferCategory => category !== null);
    }
    if (Array.isArray(record.bookmarks) && record.bookmarks.length > 0) {
      const flat = record.bookmarks
        .map((bookmark, i) => normalizeBookmark(bookmark, i, errors))
        .filter((bookmark): bookmark is TransferBookmark => bookmark !== null);
      if (flat.length > 0) {
        categories = [{ name: UNCATEGORIZED, children: [], bookmarks: flat }, ...categories];
      }
    }
  }

  if (categories.length === 0) {
    throw new Error(errors.length > 0 ? errors[0] : '未找到任何分类或书签');
  }

  const exportedAt =
    parsed !== null &&
    typeof parsed === 'object' &&
    typeof (parsed as Record<string, unknown>).exportedAt === 'string'
      ? ((parsed as Record<string, unknown>).exportedAt as string)
      : new Date().toISOString();

  return { exportedAt, categories };
}

export function serializeJson(data: TransferData): string {
  return JSON.stringify(data, null, 2);
}
