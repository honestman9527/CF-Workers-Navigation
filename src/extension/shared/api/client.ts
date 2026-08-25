/**
 * 扩展端 API adapter —— 基于 @shared 的 createApiClient 构建。
 *
 * 保留扩展端 baseUrl 第一参数的调用方式，内部统一委托 shared client。
 */
import {
  createApiClient,
  ApiError,
  type ApiClient,
} from "@shared/api/client";
import type { BookmarkInput, BookmarkListOptions } from "@shared/api/types";

export { ApiError };

/** 用 baseUrl 与 token 构造一次性 client。token 惰性绑定。 */
function withBaseUrl(baseUrl: string, token?: string): ApiClient {
  return createApiClient({ baseUrl, getToken: () => token ?? undefined });
}

export const api = {
  getBookmarks(baseUrl: string, token: string | undefined, options?: BookmarkListOptions) {
    return withBaseUrl(baseUrl, token).getBookmarks(token, options);
  },
  getCategories(baseUrl: string, token: string | undefined) {
    return withBaseUrl(baseUrl, token).getCategories(token);
  },
  getMetadata(baseUrl: string, token: string, url: string) {
    return withBaseUrl(baseUrl, token).getMetadata(token, url);
  },
  createBookmark(baseUrl: string, token: string, input: BookmarkInput) {
    return withBaseUrl(baseUrl, token).createBookmark(token, input);
  },
};
