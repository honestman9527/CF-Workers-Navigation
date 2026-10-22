import type { ApiErrorShape } from '../errors';

import type {
  AdminStats,
  Bookmark,
  BookmarkInput,
  BookmarkListOptions,
  BookmarkPage,
  Category,
  CategoryInput,
  FaviconPreview,
  MetadataPreview,
  Settings,
  PublicSettings,
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

async function request<T>(options: ClientOptions, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const authToken = options.getToken?.();
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
  me(signal?: AbortSignal): Promise<{ ok: true }>;
  getBookmarks(options?: BookmarkListOptions, signal?: AbortSignal): Promise<BookmarkPage>;
  searchBookmarks(
    query: string,
    options?: BookmarkListOptions,
    signal?: AbortSignal,
  ): Promise<BookmarkPage>;
  getTags(signal?: AbortSignal): Promise<Tag[]>;
  getCategories(signal?: AbortSignal): Promise<Category[]>;
  createCategory(input: CategoryInput): Promise<Category>;
  updateCategory(id: number, input: Partial<CategoryInput>): Promise<Category>;
  deleteCategory(id: number): Promise<void>;
  reorderCategories(ids: number[]): Promise<void>;
  getMetadata(url: string, signal?: AbortSignal): Promise<MetadataPreview>;
  getFavicon(url: string, signal?: AbortSignal): Promise<FaviconPreview>;
  getPublicSettings(signal?: AbortSignal): Promise<PublicSettings>;
  getSettings(signal?: AbortSignal): Promise<Settings>;
  updateSettings(input: Partial<Settings>): Promise<Settings>;
  createBookmark(input: BookmarkInput): Promise<Bookmark>;
  updateBookmark(id: number, input: Partial<BookmarkInput>): Promise<Bookmark>;
  deleteBookmark(id: number): Promise<void>;
  archiveBookmark(id: number): Promise<Bookmark>;
  restoreBookmark(id: number): Promise<Bookmark>;
  permanentDeleteBookmark(id: number): Promise<void>;
  createTag(name: string): Promise<Tag>;
  updateTag(id: number, name: string): Promise<Tag>;
  deleteTag(id: number): Promise<void>;
  mergeTag(id: number, targetId: number): Promise<Tag>;
  getAdminStats(signal?: AbortSignal): Promise<AdminStats>;
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
    me(signal) {
      return request<{ ok: true }>(options, ENDPOINTS.authMe, { signal });
    },
    getBookmarks(listOptions, signal) {
      const path = `${ENDPOINTS.bookmarks}${buildQuery({
        ...listOptions,
        pinned: listOptions?.pinned ? 1 : undefined,
      })}`;
      return request<BookmarkPage>(options, path, { signal });
    },
    searchBookmarks(query, listOptions, signal) {
      const path = `${ENDPOINTS.bookmarksSearch}${buildQuery({ q: query, ...listOptions })}`;
      return request<BookmarkPage>(options, path, { signal });
    },
    getTags(signal) {
      return request<Tag[]>(options, ENDPOINTS.tags, { signal });
    },
    getCategories(signal) {
      return request<Category[]>(options, ENDPOINTS.categories, { signal });
    },
    createCategory(input) {
      return request<Category>(options, ENDPOINTS.categories, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    updateCategory(id, input) {
      return request<Category>(options, `${ENDPOINTS.categories}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
    deleteCategory(id) {
      return request<void>(options, `${ENDPOINTS.categories}/${id}`, { method: 'DELETE' });
    },
    reorderCategories(ids) {
      return request<void>(options, ENDPOINTS.categoriesReorder, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
    },
    getMetadata(url, signal) {
      return request<MetadataPreview>(
        options,
        `${ENDPOINTS.bookmarksMetadata}${buildQuery({ url })}`,
        { signal },
      );
    },
    getFavicon(url, signal) {
      return request<FaviconPreview>(
        options,
        `${ENDPOINTS.bookmarksFavicon}${buildQuery({ url })}`,
        { signal },
      );
    },
    getPublicSettings(signal) {
      return request<PublicSettings>(options, ENDPOINTS.publicSettings, { signal });
    },
    getSettings(signal) {
      return request<Settings>(options, ENDPOINTS.settings, { signal });
    },
    updateSettings(input) {
      return request<Settings>(options, ENDPOINTS.settings, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
    createBookmark(input) {
      return request<Bookmark>(options, ENDPOINTS.bookmarks, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    updateBookmark(id, input) {
      return request<Bookmark>(options, `${ENDPOINTS.bookmarks}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
    deleteBookmark(id) {
      return request<void>(options, `${ENDPOINTS.bookmarks}/${id}`, { method: 'DELETE' });
    },
    archiveBookmark(id) {
      return request<Bookmark>(options, `${ENDPOINTS.bookmarks}/${id}/archive`, { method: 'POST' });
    },
    restoreBookmark(id) {
      return request<Bookmark>(options, `${ENDPOINTS.bookmarks}/${id}/restore`, { method: 'POST' });
    },
    permanentDeleteBookmark(id) {
      return request<void>(options, `${ENDPOINTS.bookmarks}/${id}/permanent`, { method: 'DELETE' });
    },
    createTag(name) {
      return request<Tag>(options, ENDPOINTS.tags, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    },
    updateTag(id, name) {
      return request<Tag>(options, `${ENDPOINTS.tags}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
    },
    deleteTag(id) {
      return request<void>(options, `${ENDPOINTS.tags}/${id}`, { method: 'DELETE' });
    },
    mergeTag(id, targetId) {
      return request<Tag>(options, ENDPOINTS.tagsMerge(id), {
        method: 'POST',
        body: JSON.stringify({ targetId }),
      });
    },
    getAdminStats(signal) {
      return request<AdminStats>(options, ENDPOINTS.adminStats, { signal });
    },
  };
}
