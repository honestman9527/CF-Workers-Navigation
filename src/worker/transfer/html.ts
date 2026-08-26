import type { TransferBookmark, TransferCategory, TransferData } from './types';

import { UNCATEGORIZED_SLUG } from '../../shared/api/types';
import { slugify } from '../slug';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 未分类书签在 HTML 导出/导入中使用的文件夹名称。 */
const UNCATEGORIZED_NAME = '未分类';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return match ? unescapeHtml(match[1]) : null;
}

function parseIcon(icon: string | null, iconUri: string | null): string | null {
  const value = iconUri ?? icon;
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function parseAddedAt(addDate: string | null): string | null {
  if (!addDate) return null;
  const timestamp = Number(addDate);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : null;
}

type FolderEntry = { name: string; slug: string };

/** 向上找最近的「非未分类」文件夹作为分类；没有则返回 null（书签属于未分类）。 */
function nearestCategorySlug(stack: FolderEntry[]): string | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].slug !== UNCATEGORIZED_SLUG) return stack[index].slug;
  }
  return null;
}

export function parseHtml(input: string): TransferData {
  const lines = input.split(/\r?\n/);
  const folderStack: FolderEntry[] = [];
  const bookmarks: TransferBookmark[] = [];
  const categories: TransferCategory[] = [];
  const seenSlugs = new Set<string>();
  let lastBookmark: TransferBookmark | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^<DL(?:\s|>)/i.test(line)) continue;
    if (/^<\/DL>/i.test(line)) {
      folderStack.pop();
      continue;
    }

    const folderMatch = line.match(/^<DT>\s*<H3[^>]*>([^<]*)<\/H3>/i);
    if (folderMatch) {
      const name = unescapeHtml(folderMatch[1]).trim() || '未命名分类';
      const slug = slugify(name) || UNCATEGORIZED_SLUG;
      const uncategorized = slug === UNCATEGORIZED_SLUG || name === UNCATEGORIZED_NAME;
      const parentSlug = nearestCategorySlug(folderStack);
      folderStack.push({ name, slug: uncategorized ? UNCATEGORIZED_SLUG : slug });
      if (!uncategorized && !seenSlugs.has(slug)) {
        seenSlugs.add(slug);
        categories.push({ name, slug, parentSlug });
      }
      lastBookmark = null;
      continue;
    }

    const bookmarkMatch = line.match(/^<DT>\s*<A\s+([^>]*)>([^<]*)<\/A>/i);
    if (bookmarkMatch) {
      const attrs = bookmarkMatch[1];
      const url = extractAttr(attrs, 'HREF');
      if (!url) continue;
      const bookmark: TransferBookmark = {
        title: unescapeHtml(bookmarkMatch[2]).trim() || '未命名书签',
        url,
        iconUrl: parseIcon(extractAttr(attrs, 'ICON'), extractAttr(attrs, 'ICON_URI')),
        addedAt: parseAddedAt(extractAttr(attrs, 'ADD_DATE')),
        categorySlug: nearestCategorySlug(folderStack),
        tags: [],
      };
      bookmarks.push(bookmark);
      lastBookmark = bookmark;
      continue;
    }

    const descriptionMatch = line.match(/^<DD>(.*)$/i);
    if (descriptionMatch && lastBookmark)
      lastBookmark.description = unescapeHtml(descriptionMatch[1]).trim();
  }

  if (bookmarks.length === 0) throw new Error('未找到任何有效书签');
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: categories.length > 0 ? categories : undefined,
    bookmarks,
  };
}

function serializeBookmark(bookmark: TransferBookmark, indent: string): string {
  const attrs: string[] = [`HREF="${escapeHtml(bookmark.url)}"`];
  if (bookmark.iconUrl) attrs.push(`ICON="${escapeHtml(bookmark.iconUrl)}"`);
  if (bookmark.addedAt) {
    const timestamp = Math.floor(new Date(bookmark.addedAt).getTime() / 1000);
    if (!Number.isNaN(timestamp)) attrs.push(`ADD_DATE="${timestamp}"`);
  }
  const lines = [`${indent}<DT><A ${attrs.join(' ')}>${escapeHtml(bookmark.title)}</A>`];
  if (bookmark.description) lines.push(`${indent}<DD>${escapeHtml(bookmark.description)}`);
  return lines.join('\n');
}

function serializeFolder(name: string, content: string[], indent: string): string {
  const lines = [`${indent}<DT><H3>${escapeHtml(name)}</H3>`, `${indent}<DL><p>`];
  lines.push(...content);
  lines.push(`${indent}</DL><p>`);
  return lines.join('\n');
}

type CategoryNode = {
  name: string;
  slug: string;
  bookmarks: TransferBookmark[];
  children: CategoryNode[];
};

function serializeNode(node: CategoryNode, indent: string): string {
  const content: string[] = [];
  for (const bookmark of node.bookmarks) {
    content.push(serializeBookmark(bookmark, `${indent}    `));
  }
  for (const child of node.children) {
    content.push(serializeNode(child, `${indent}    `));
  }
  return serializeFolder(node.name, content, indent);
}

function categorySlug(category: TransferCategory): string | null {
  const slug = category.slug?.trim() || slugify(category.name);
  return slug && slug !== UNCATEGORIZED_SLUG ? slug : null;
}

export function serializeHtml(data: TransferData): string {
  const header = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  const nodes = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  for (const category of data.categories ?? []) {
    const slug = categorySlug(category);
    if (!slug) continue;
    nodes.set(slug, { name: category.name, slug, bookmarks: [], children: [] });
  }
  for (const category of data.categories ?? []) {
    const slug = categorySlug(category);
    if (!slug) continue;
    const node = nodes.get(slug)!;
    const parentSlug = category.parentSlug?.trim() || null;
    const parent = parentSlug ? nodes.get(parentSlug) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  const uncategorized: TransferBookmark[] = [];
  for (const bookmark of data.bookmarks) {
    const node = bookmark.categorySlug ? nodes.get(bookmark.categorySlug) : undefined;
    if (node) node.bookmarks.push(bookmark);
    else uncategorized.push(bookmark);
  }

  const body: string[] = [];
  for (const root of roots) body.push(serializeNode(root, '    '));
  if (uncategorized.length > 0) {
    const content = uncategorized.map((bookmark) => serializeBookmark(bookmark, '        '));
    body.push(serializeFolder(UNCATEGORIZED_NAME, content, '    '));
  }
  return `${header.join('\n')}\n${body.join('\n')}\n</DL><p>\n`;
}
