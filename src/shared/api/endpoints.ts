export const API_V1_PREFIX = '/api/v1';

export const ENDPOINTS = {
  authLogin: `${API_V1_PREFIX}/auth/login`,
  authLogout: `${API_V1_PREFIX}/auth/logout`,
  authMe: `${API_V1_PREFIX}/auth/me`,
  bookmarks: `${API_V1_PREFIX}/bookmarks`,
  bookmarksSearch: `${API_V1_PREFIX}/bookmarks/search`,
  bookmarksMetadata: `${API_V1_PREFIX}/bookmarks/metadata`,
  bookmarksFavicon: `${API_V1_PREFIX}/bookmarks/favicon`,
  bookmarksTags: `${API_V1_PREFIX}/bookmarks/tags`,
  settings: `${API_V1_PREFIX}/settings`,
  transferExport: `${API_V1_PREFIX}/transfer/export`,
  transferImport: `${API_V1_PREFIX}/transfer/import`,
} as const;

export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) usp.set(key, String(value));
  }
  const query = usp.toString();
  return query ? `?${query}` : '';
}

export function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return normalizedBase ? `${normalizedBase}${normalizedPath}` : normalizedPath;
}
