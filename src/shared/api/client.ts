import type { ApiErrorShape } from '../errors';

import type {
  Bookmark,
  BookmarkInput,
  BookmarkListOptions,
  BookmarkPage,
  FaviconPreview,
  MetadataPreview,
  Settings,
  Tag,
} from './types';

import { ENDPOINTS, buildQuery, joinUrl } from './endpoints';

export interface ClientOptions {
  baseUrl?: string;
  getToken?: () => string | undefined | null;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  options: ClientOptions,
  path: string,
  init?: RequestInit,
  token?: string,
): Promise<T> {
  const headers = new Headers(init?.headers);
  const authToken = token ?? options.getToken?.();
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await (options.fetch ?? globalThis.fetch)(joinUrl(options.baseUrl ?? '', path), {
    ...init,
    headers,
  });
  const contentType = response.headers.get('Content-Type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as T | ApiErrorShape)
    : null;
  if (!response.ok) {
    const shape = (body ?? {}) as ApiErrorShape;
    throw new ApiError(
      response.status,
      shape.error?.message ?? 'Request failed',
      shape.error?.code,
    );
  }
  return body as T;
}

export interface ApiClient {
  login(password: string): Promise<void>;
  logout(): Promise<void>;
  me(token?: string, signal?: AbortSignal): Promise<{ ok: true }>;
  getBookmarks(
    token: string | undefined,
    options?: BookmarkListOptions,
    signal?: AbortSignal,
  ): Promise<BookmarkPage>;
  searchBookmarks(
    token: string | undefined,
    query: string,
    options?: BookmarkListOptions,
    signal?: AbortSignal,
  ): Promise<BookmarkPage>;
  getTags(token?: string, signal?: AbortSignal): Promise<Tag[]>;
  getMetadata(
    token: string | undefined,
    url: string,
    signal?: AbortSignal,
  ): Promise<MetadataPreview>;
  getFavicon(token: string | undefined, url: string, signal?: AbortSignal): Promise<FaviconPreview>;
  getSettings(token?: string, signal?: AbortSignal): Promise<Settings>;
  updateSettings(token: string, input: Partial<Settings>): Promise<Settings>;
  createBookmark(token: string, input: BookmarkInput): Promise<Bookmark>;
  updateBookmark(token: string, id: number, input: Partial<BookmarkInput>): Promise<Bookmark>;
  deleteBookmark(token: string, id: number): Promise<void>;
  archiveBookmark(token: string, id: number): Promise<Bookmark>;
  restoreBookmark(token: string, id: number): Promise<Bookmark>;
  permanentDeleteBookmark(token: string, id: number): Promise<void>;
}

export function createApiClient(options: ClientOptions): ApiClient {
  return {
    login(password) {
      return request<void>(options, ENDPOINTS.authLogin, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
    },
    logout() {
      return request<void>(options, ENDPOINTS.authLogout, { method: 'POST' });
    },
    me(token, signal) {
      return request<{ ok: true }>(options, ENDPOINTS.authMe, { signal }, token);
    },
    getBookmarks(token, listOptions, signal) {
      const path = `${ENDPOINTS.bookmarks}${buildQuery({
        ...listOptions,
        pinned: listOptions?.pinned ? 1 : undefined,
      })}`;
      return request<BookmarkPage>(options, path, { signal }, token);
    },
    searchBookmarks(token, query, listOptions, signal) {
      const path = `${ENDPOINTS.bookmarksSearch}${buildQuery({ q: query, ...listOptions })}`;
      return request<BookmarkPage>(options, path, { signal }, token);
    },
    getTags(token, signal) {
      return request<Tag[]>(options, ENDPOINTS.bookmarksTags, { signal }, token);
    },
    getMetadata(token, url, signal) {
      return request<MetadataPreview>(
        options,
        `${ENDPOINTS.bookmarksMetadata}${buildQuery({ url })}`,
        { signal },
        token,
      );
    },
    getFavicon(token, url, signal) {
      return request<FaviconPreview>(
        options,
        `${ENDPOINTS.bookmarksFavicon}${buildQuery({ url })}`,
        { signal },
        token,
      );
    },
    getSettings(token, signal) {
      return request<Settings>(options, ENDPOINTS.settings, { signal }, token);
    },
    updateSettings(token, input) {
      return request<Settings>(
        options,
        ENDPOINTS.settings,
        { method: 'PUT', body: JSON.stringify(input) },
        token,
      );
    },
    createBookmark(token, input) {
      return request<Bookmark>(
        options,
        ENDPOINTS.bookmarks,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    updateBookmark(token, id, input) {
      return request<Bookmark>(
        options,
        `${ENDPOINTS.bookmarks}/${id}`,
        { method: 'PUT', body: JSON.stringify(input) },
        token,
      );
    },
    deleteBookmark(token, id) {
      return request<void>(options, `${ENDPOINTS.bookmarks}/${id}`, { method: 'DELETE' }, token);
    },
    archiveBookmark(token, id) {
      return request<Bookmark>(
        options,
        `${ENDPOINTS.bookmarks}/${id}/archive`,
        { method: 'POST' },
        token,
      );
    },
    restoreBookmark(token, id) {
      return request<Bookmark>(
        options,
        `${ENDPOINTS.bookmarks}/${id}/restore`,
        { method: 'POST' },
        token,
      );
    },
    permanentDeleteBookmark(token, id) {
      return request<void>(
        options,
        `${ENDPOINTS.bookmarks}/${id}/permanent`,
        { method: 'DELETE' },
        token,
      );
    },
  };
}
