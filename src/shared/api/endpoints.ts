/**
 * API 端点路径与 query 构造 —— 消除 app/extension 两端的 URL 拼接重复。
 *
 * 仅放路径常量与纯函数，不引入运行时依赖。
 */

/** 当前公开 API 版本。旧 `/api` 路径仍由 Worker 提供兼容别名。 */
export const API_V1_PREFIX = '/api/v1';

/** API 路径常量。 */
export const ENDPOINTS = {
  authLogin: `${API_V1_PREFIX}/auth/login`,
  authLogout: `${API_V1_PREFIX}/auth/logout`,
  authMe: `${API_V1_PREFIX}/auth/me`,
  categories: `${API_V1_PREFIX}/categories`,
  bookmarks: `${API_V1_PREFIX}/bookmarks`,
  bookmarksSearch: `${API_V1_PREFIX}/bookmarks/search`,
  bookmarksPinned: `${API_V1_PREFIX}/bookmarks/pinned`,
  bookmarksMetadata: `${API_V1_PREFIX}/bookmarks/metadata`,
  bookmarksFavicon: `${API_V1_PREFIX}/bookmarks/favicon`,
  bookmarksTags: `${API_V1_PREFIX}/bookmarks/tags`,
  settings: `${API_V1_PREFIX}/settings`,
  transferExport: `${API_V1_PREFIX}/transfer/export`,
  transferImport: `${API_V1_PREFIX}/transfer/import`,
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
