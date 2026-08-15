/**
 * 扩展端 API 数据类型 —— 从 @shared re-export。
 *
 * 此前扩展端独立维护一份以避免与 web 前端耦合，
 * 但导致契约漂移（MetadataPreview 曾缺失 metadata 子对象）。
 * 现统一收敛到 @shared，Web、Worker 与扩展共享同一份契约。
 */
export type {
  Bookmark,
  CategoryNode,
  BookmarkInput,
  CategoryInput,
  MetadataPreview,
  Settings,
} from "@shared/api/types";
