/**
 * 扩展端 API adapter —— 基于 @shared 的 createApiClient 构建。
 *
 * 保留原有方法签名（baseUrl 第一参数，token 第二参数），
 * 使所有调用点（background / popup / newtab / options）零改动。
 * 内部委托给 shared client，消除 request / ApiError / joinUrl / buildQuery 重复。
 */
import {
  createApiClient,
  ApiError,
  type ApiClient,
} from "@shared/api/client";
import type {
  Bookmark,
  BookmarkInput,
  CategoryNode,
  MetadataPreview,
  Settings,
  Tag,
} from "@shared/api/types";

export { ApiError };

/** 用 baseUrl 与 token 构造一次性 client。token 惰性绑定。 */
function withBaseUrl(baseUrl: string, token?: string): ApiClient {
  return createApiClient({ baseUrl, getToken: () => token ?? undefined });
}

export const api = {
  getCategories(baseUrl: string, token?: string) {
    return withBaseUrl(baseUrl, token).getCategories(token);
  },
  getBookmarks(baseUrl: string, token: string | undefined, categoryId?: number, includeChildren = false) {
    return withBaseUrl(baseUrl, token ?? undefined).getBookmarks(token, categoryId, includeChildren);
  },
  getPinnedBookmarks(baseUrl: string, token?: string) {
    return withBaseUrl(baseUrl, token).getPinnedBookmarks(token);
  },
  searchBookmarks(baseUrl: string, token: string | undefined, query: string) {
    return withBaseUrl(baseUrl, token ?? undefined).searchBookmarks(token, query);
  },
  getMetadata(baseUrl: string, token: string, url: string) {
    return withBaseUrl(baseUrl, token).getMetadata(token, url);
  },
  getSettings(baseUrl: string, token?: string) {
    return withBaseUrl(baseUrl, token).getSettings(token);
  },
  createBookmark(baseUrl: string, token: string, input: BookmarkInput) {
    return withBaseUrl(baseUrl, token).createBookmark(token, input);
  },
};

// 保留类型导出，供调用点 import type 使用（零改动兼容）
export type {
  Bookmark,
  BookmarkInput,
  CategoryNode,
  MetadataPreview,
  Settings,
  Tag,
};
