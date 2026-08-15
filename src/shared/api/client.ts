/**
 * 可配置 fetch client 工厂 —— Web / Worker adapter / extension 共享同一份请求逻辑。
 *
 * 设计：
 * - `createApiClient({ baseUrl, getToken })` 在创建时绑定 baseUrl 与 token 取数器。
 * - 同源（app）：baseUrl 留空，走相对路径。
 * - 跨源（extension）：传入 baseUrl，请求拼接为绝对地址。
 * - token 由 getToken() 惰性获取，便于 extension 配置变化后无需重建 client
 *   （只要 getToken 读取最新配置即可）。
 *
 * 注意：导出 / 导入（Blob / XHR 进度）为 app 专属，留在 app 端实现，不在此处。
 * 本 client 仅提供两端通用的方法。
 */

import type { ApiErrorShape } from '../errors';

import type {
  Bookmark,
  BookmarkInput,
  CategoryInput,
  CategoryNode,
  MetadataPreview,
  Settings,
} from './types';

import { ENDPOINTS, buildQuery, joinUrl } from './endpoints';

/** 客户端配置。 */
export interface ClientOptions {
  /** API 基地址。同源场景留空走相对路径；跨源场景传完整 origin。 */
  baseUrl?: string;
  /** 取数器：返回当前 token，无 token 返回 undefined/null。惰性求值。 */
  getToken?: () => string | undefined | null;
  /** 可替换的 fetch adapter；生产环境默认使用 globalThis.fetch。 */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/** API 错误类。两端共用，避免各自定义。 */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** 通用请求：处理 headers、token、错误响应解析。 */
async function request<T>(
  options: ClientOptions,
  path: string,
  init?: RequestInit,
  tokenOverride?: string,
): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = tokenOverride ?? options.getToken?.();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const fetcher = options.fetch ?? globalThis.fetch;
  const response = await fetcher(joinUrl(options.baseUrl ?? '', path), { ...init, headers });
  const contentType = response.headers.get('Content-Type') ?? '';
  const json = contentType.includes('application/json')
    ? ((await response.json()) as T | ApiErrorShape)
    : null;

  if (!response.ok) {
    const shape = (json ?? {}) as ApiErrorShape;
    throw new ApiError(
      response.status,
      shape.error?.message ?? 'Request failed',
      shape.error?.code,
    );
  }

  return json as T;
}

/** 客户端方法集合。 */
export interface ApiClient {
  login(password: string): Promise<void>;
  logout(): Promise<void>;
  me(token?: string, signal?: AbortSignal): Promise<{ ok: true }>;
  getCategories(token?: string, signal?: AbortSignal): Promise<CategoryNode[]>;
  getBookmarks(
    token: string | undefined,
    categoryId?: number,
    includeChildren?: boolean,
    signal?: AbortSignal,
  ): Promise<Bookmark[]>;
  getPinnedBookmarks(token?: string, signal?: AbortSignal): Promise<Bookmark[]>;
  searchBookmarks(
    token: string | undefined,
    query: string,
    signal?: AbortSignal,
  ): Promise<Bookmark[]>;
  getMetadata(token: string, url: string): Promise<MetadataPreview>;
  getSettings(token?: string): Promise<Settings>;
  updateSettings(token: string, input: Partial<Settings>): Promise<Settings>;
  createBookmark(token: string, input: BookmarkInput): Promise<Bookmark>;
  updateBookmark(token: string, id: number, input: Partial<BookmarkInput>): Promise<Bookmark>;
  deleteBookmark(token: string, id: number): Promise<void>;
  createCategory(token: string, input: CategoryInput): Promise<CategoryNode>;
  updateCategory(token: string, id: number, input: Partial<CategoryInput>): Promise<CategoryNode>;
  deleteCategory(token: string, id: number): Promise<void>;
}

/**
 * 创建 API client。token 通过 getToken 惰性获取，
 * 也可在每个方法调用时显式传入（覆盖 getToken）。
 */
export function createApiClient(options: ClientOptions): ApiClient {
  return {
    login(password: string) {
      return request<void>(options, ENDPOINTS.authLogin, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
    },
    logout() {
      return request<void>(options, ENDPOINTS.authLogout, { method: 'POST' });
    },
    me(token?: string, signal?: AbortSignal) {
      return request<{ ok: true }>(options, ENDPOINTS.authMe, { signal }, token);
    },
    getCategories(token?: string, signal?: AbortSignal) {
      return request<CategoryNode[]>(options, ENDPOINTS.categories, { signal }, token);
    },
    getBookmarks(token, categoryId, includeChildren = false, signal?: AbortSignal) {
      const path = `${ENDPOINTS.bookmarks}${buildQuery({
        category: categoryId,
        includeChildren: includeChildren ? 1 : undefined,
      })}`;
      return request<Bookmark[]>(options, path, { signal }, token);
    },
    getPinnedBookmarks(token?: string, signal?: AbortSignal) {
      return request<Bookmark[]>(options, ENDPOINTS.bookmarksPinned, { signal }, token);
    },
    searchBookmarks(token, query, signal?: AbortSignal) {
      const path = `${ENDPOINTS.bookmarksSearch}${buildQuery({ q: query })}`;
      return request<Bookmark[]>(options, path, { signal }, token);
    },
    getMetadata(token, url) {
      const path = `${ENDPOINTS.bookmarksMetadata}${buildQuery({ url })}`;
      return request<MetadataPreview>(options, path, undefined, token);
    },
    getSettings(token?: string) {
      return request<Settings>(options, ENDPOINTS.settings, undefined, token);
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
    createCategory(token, input) {
      return request<CategoryNode>(
        options,
        ENDPOINTS.categories,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    updateCategory(token, id, input) {
      return request<CategoryNode>(
        options,
        `${ENDPOINTS.categories}/${id}`,
        { method: 'PUT', body: JSON.stringify(input) },
        token,
      );
    },
    deleteCategory(token, id) {
      return request<void>(options, `${ENDPOINTS.categories}/${id}`, { method: 'DELETE' }, token);
    },
  };
}
