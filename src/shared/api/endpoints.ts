/**
 * API 端点路径与 query 构造 —— 消除 app/extension 两端的 URL 拼接重复。
 *
 * 仅放路径常量与纯函数，不引入运行时依赖。
 */

/** API 路径常量。 */
export const ENDPOINTS = {
  authLogin: '/api/auth/login',
  authLogout: '/api/auth/logout',
  authMe: '/api/auth/me',
  categories: '/api/categories',
  bookmarks: '/api/bookmarks',
  bookmarksSearch: '/api/bookmarks/search',
  bookmarksPinned: '/api/bookmarks/pinned',
  bookmarksMetadata: '/api/bookmarks/metadata',
  bookmarksTags: '/api/bookmarks/tags',
  settings: '/api/settings',
  transferExport: '/api/transfer/export',
  transferImport: '/api/transfer/import',
} as const;

/** 构造 query string。空值跳过。返回形如 `"?a=1&b=2"` 或空串。 */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      usp.set(k, String(v));
    }
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/** 拼接 baseUrl + path，处理末尾斜杠。baseUrl 为空时返回 path（同源相对路径）。 */
export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return b ? `${b}${p}` : p;
}
