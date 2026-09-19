import type { TransferBookmark, TransferCategory, TransferData } from './types';

function visibility(value: unknown): 'public' | 'private' | undefined {
  if (value === undefined) return undefined;
  if (value === 'public' || value === 'private') return value;
  throw new Error('权限必须为 public 或 private');
}

const UNNAMED_BOOKMARK = '未命名书签';

function syntaxError(input: string, error: SyntaxError): never {
  const positionMatch = error.message.match(/position (\d+)/);
  const position = positionMatch ? Number(positionMatch[1]) : 0;
  const before = input.slice(0, position);
  const line = before.split(/\r?\n/).length;
  const column = position - before.lastIndexOf('\n');
  throw new Error(`JSON 格式有误：第 ${line} 行 第 ${column} 列（${error.message}）`);
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^[a-z]+:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags = new Map<string, string>();
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    const key = name.toLocaleLowerCase();
    if (name && !tags.has(key)) tags.set(key, name);
  }
  return [...tags.values()].slice(0, 30);
}

function normalizeCategorySlug(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, 64);
}

function normalizeCategory(raw: unknown, index: number, errors: string[]): TransferCategory | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`第 ${index + 1} 个分类不是对象，已跳过`);
    return null;
  }
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : '';
  if (!name) {
    errors.push(`第 ${index + 1} 个分类缺少名称，已跳过`);
    return null;
  }
  const slug = typeof record.slug === 'string' && record.slug.trim() ? record.slug.trim() : '';
  return {
    name,
    slug,
    visibility: visibility(record.visibility),
    icon: typeof record.icon === 'string' && record.icon.trim() ? record.icon.trim() : null,
    parentSlug: normalizeCategorySlug(record.parentSlug),
  };
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
  const addedAt = typeof record.addedAt === 'string' ? record.addedAt : null;
  const archivedAt = typeof record.archivedAt === 'string' ? record.archivedAt : null;
  const deletedAt = typeof record.deletedAt === 'string' ? record.deletedAt : null;

  return {
    title,
    url,
    visibility: visibility(record.visibility),
    description,
    iconUrl,
    isPinned,
    categorySlug: normalizeCategorySlug(record.categorySlug),
    tags: normalizeTags(record.tags),
    archivedAt,
    deletedAt,
    addedAt,
  };
}

export function parseJson(input: string): TransferData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    if (error instanceof SyntaxError) syntaxError(input, error);
    throw error;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('旧分类格式已不再支持，请使用包含 bookmarks 的标签备份');
  }

  const record = parsed as Record<string, unknown>;
  // 旧分类树：分类节点带 children / bookmarks 数组；新分类是扁平的 name/slug/parentSlug。
  const isLegacyTree =
    Array.isArray(record.categories) &&
    record.categories.some(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        (Array.isArray((item as Record<string, unknown>).children) ||
          Array.isArray((item as Record<string, unknown>).bookmarks)),
    );
  if (isLegacyTree) {
    throw new Error('旧分类格式已不再支持，请使用包含 bookmarks 的标签备份');
  }
  if (record.categories !== undefined && !Array.isArray(record.categories)) {
    throw new Error('分类字段格式有误');
  }
  if (record.version !== undefined && record.version !== 1 && record.version !== 2) {
    throw new Error('不支持的 JSON 备份版本');
  }
  if (!Array.isArray(record.bookmarks)) {
    throw new Error('未找到 bookmarks 数组');
  }

  const errors: string[] = [];
  const categories = (Array.isArray(record.categories) ? record.categories : [])
    .map((category, index) => normalizeCategory(category, index, errors))
    .filter((category): category is TransferCategory => category !== null);
  const bookmarks = record.bookmarks
    .map((bookmark, index) => normalizeBookmark(bookmark, index, errors))
    .filter((bookmark): bookmark is TransferBookmark => bookmark !== null);
  if (bookmarks.length === 0 && errors.length > 0) throw new Error(errors[0]);

  return {
    version: record.version === 2 ? 2 : 1,
    exportedAt:
      typeof record.exportedAt === 'string' ? record.exportedAt : new Date().toISOString(),
    categories,
    bookmarks,
  };
}

export function serializeJson(data: TransferData): string {
  return JSON.stringify(
    {
      version: 2,
      exportedAt: data.exportedAt,
      categories: data.categories,
      bookmarks: data.bookmarks,
    },
    null,
    2,
  );
}
