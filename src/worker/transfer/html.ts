import type { TransferBookmark, TransferCategory, TransferData } from './types';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

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
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return null;
}

function parseAddedAt(addDate: string | null): string | null {
  if (!addDate) {
    return null;
  }

  const timestamp = Number(addDate);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return new Date(timestamp * 1000).toISOString();
}

type ParseNode = {
  type: 'folder' | 'bookmark';
  name: string;
  bookmark?: TransferBookmark;
  children: ParseNode[];
};

function nodeToCategory(node: ParseNode): TransferCategory {
  return {
    name: node.name,
    children: node.children.filter((child) => child.type === 'folder').map(nodeToCategory),
    bookmarks: node.children
      .filter((child) => child.type === 'bookmark')
      .map((child) => child.bookmark!)
      .filter((bookmark): bookmark is TransferBookmark => bookmark !== undefined),
  };
}

export function parseHtml(input: string): TransferData {
  const lines = input.split(/\r?\n/);
  const root: ParseNode = { type: 'folder', name: 'Bookmarks', children: [] };
  const stack: ParseNode[] = [root];
  let lastBookmark: TransferBookmark | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^<DL>/i.test(line) || /^<DL\s/i.test(line)) {
      continue;
    }

    if (/^<\/DL>/i.test(line)) {
      stack.pop();
      if (stack.length === 0) {
        stack.push(root);
      }
      continue;
    }

    const folderMatch = line.match(/^<DT>\s*<H3[^>]*>([^<]*)<\/H3>/i);
    if (folderMatch) {
      const name = unescapeHtml(folderMatch[1]).trim() || '未命名分类';
      const folder: ParseNode = { type: 'folder', name, children: [] };
      stack[stack.length - 1]?.children.push(folder);
      stack.push(folder);
      lastBookmark = null;
      continue;
    }

    const bookmarkMatch = line.match(/^<DT>\s*<A\s+([^>]*)>([^<]*)<\/A>/i);
    if (bookmarkMatch) {
      const attrs = bookmarkMatch[1];
      const title = unescapeHtml(bookmarkMatch[2]).trim() || '未命名书签';
      const url = extractAttr(attrs, 'HREF');
      if (!url) {
        continue;
      }
      const iconUri = extractAttr(attrs, 'ICON_URI');
      const icon = extractAttr(attrs, 'ICON');
      const addDate = extractAttr(attrs, 'ADD_DATE');

      const bookmark: TransferBookmark = {
        title,
        url,
        iconUrl: parseIcon(icon, iconUri),
        addedAt: parseAddedAt(addDate),
      };
      stack[stack.length - 1]?.children.push({
        type: 'bookmark',
        name: title,
        bookmark,
        children: [],
      });
      lastBookmark = bookmark;
      continue;
    }

    const ddMatch = line.match(/^<DD>(.*)$/i);
    if (ddMatch && lastBookmark) {
      lastBookmark.description = unescapeHtml(ddMatch[1]).trim();
    }
  }

  const categories = root.children.filter((child) => child.type === 'folder').map(nodeToCategory);

  const flatBookmarks = root.children
    .filter((child) => child.type === 'bookmark')
    .map((child) => child.bookmark!)
    .filter((bookmark): bookmark is TransferBookmark => bookmark !== undefined);

  const rootBookmarks: TransferCategory | null =
    flatBookmarks.length > 0
      ? { name: '未分类书签', children: [], bookmarks: flatBookmarks }
      : null;

  return {
    exportedAt: new Date().toISOString(),
    categories: rootBookmarks ? [rootBookmarks, ...categories] : categories,
  };
}

function serializeBookmark(bookmark: TransferBookmark, indent: string): string {
  const attrs: string[] = [`HREF="${escapeHtml(bookmark.url)}"`];
  if (bookmark.iconUrl) {
    attrs.push(`ICON="${escapeHtml(bookmark.iconUrl)}"`);
  }
  if (bookmark.addedAt) {
    const timestamp = Math.floor(new Date(bookmark.addedAt).getTime() / 1000);
    if (!Number.isNaN(timestamp)) {
      attrs.push(`ADD_DATE="${timestamp}"`);
    }
  }

  const lines = [`${indent}<DT><A ${attrs.join(' ')}>${escapeHtml(bookmark.title)}</A>`];
  if (bookmark.description) {
    lines.push(`${indent}<DD>${escapeHtml(bookmark.description)}`);
  }
  return lines.join('\n');
}

function serializeCategory(category: TransferCategory, indent: string): string {
  const lines = [`${indent}<DT><H3>${escapeHtml(category.name)}</H3>`, `${indent}<DL><p>`];

  for (const bookmark of category.bookmarks) {
    lines.push(serializeBookmark(bookmark, `${indent}    `));
  }

  for (const child of category.children) {
    lines.push(serializeCategory(child, `${indent}    `));
  }

  lines.push(`${indent}</DL><p>`);
  return lines.join('\n');
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

  const body = data.categories.map((category) => serializeCategory(category, '    ')).join('\n');

  return `${header.join('\n')}\n${body}\n</DL><p>\n`;
}
