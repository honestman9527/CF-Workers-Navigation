import type { ExportFormat } from './types';

export function detectFormat(filename: string, content: string): ExportFormat {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  const trimmed = content.slice(0, 512);

  const looksLikeHtml =
    /<!doctype\s+netscape/i.test(trimmed) ||
    /<dl[^>]*>/i.test(trimmed) ||
    /<h3[^>]*>/i.test(trimmed);

  if (ext === 'html' || ext === 'htm') {
    if (looksLikeHtml) {
      return 'html';
    }
  }

  if (ext === 'json') {
    return 'json';
  }

  if (looksLikeHtml) {
    return 'html';
  }

  try {
    JSON.parse(content);
    return 'json';
  } catch {
    // not json
  }

  throw new Error('无法识别文件格式，请使用 HTML（浏览器书签）或 JSON（nav 备份）');
}
