import type { TransferBookmark, TransferData } from './types';

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
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function parseAddedAt(addDate: string | null): string | null {
  if (!addDate) return null;
  const timestamp = Number(addDate);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : null;
}

function cleanTags(tags: string[]): string[] {
  const unique = new Map<string, string>();
  for (const raw of tags) {
    const name = raw.trim();
    if (name && !unique.has(name.toLocaleLowerCase())) unique.set(name.toLocaleLowerCase(), name);
  }
  return [...unique.values()].slice(0, 30);
}

export function parseHtml(input: string): TransferData {
  const lines = input.split(/\r?\n/);
  const folderStack: string[] = [];
  const bookmarks: TransferBookmark[] = [];
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
      folderStack.push(unescapeHtml(folderMatch[1]).trim() || '未命名标签');
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
        tags: cleanTags(folderStack),
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
  return { version: 1, exportedAt: new Date().toISOString(), bookmarks };
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

function serializeFolder(name: string, bookmarks: TransferBookmark[], indent: string): string {
  const lines = [`${indent}<DT><H3>${escapeHtml(name)}</H3>`, `${indent}<DL><p>`];
  for (const bookmark of bookmarks) lines.push(serializeBookmark(bookmark, `${indent}    `));
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
  const groups = new Map<string, TransferBookmark[]>();
  for (const bookmark of data.bookmarks) {
    const tags = bookmark.tags.length > 0 ? bookmark.tags : ['未分类'];
    for (const tag of tags) groups.set(tag, [...(groups.get(tag) ?? []), bookmark]);
  }
  const body = [...groups]
    .map(([tag, bookmarks]) => serializeFolder(tag, bookmarks, '    '))
    .join('\n');
  return `${header.join('\n')}\n${body}\n</DL><p>\n`;
}
