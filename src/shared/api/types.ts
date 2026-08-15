/**
 * 跨端共享 API 数据契约 —— 单一真相源。
 *
 * Worker 路由输出、Web 前端、extension 客户端均引用本文件类型，
 * 避免三处分别定义导致漂移。
 *
 * 注意：本文件为纯类型与常量，不引入任何运行时依赖，
 * 以便 worker（esbuild bundle）与浏览器（vite）两端均可无副作用引用。
 */

/** 书签 DTO。对齐 worker `toBookmark` 转换后的输出与 drizzle schema。 */
export type Bookmark = {
  id: number;
  categoryId: number;
  title: string;
  url: string;
  description: string | null;
  iconUrl: string | null;
  isPinned: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** 分类树节点 DTO。对齐 worker `categories` 路由的树构造输出。 */
export type CategoryNode = {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  bookmarkCount: number;
  totalBookmarkCount: number;
  children: CategoryNode[];
};

/** 书签创建/更新入参。 */
export type BookmarkInput = {
  categoryId: number;
  title: string;
  url: string;
  description?: string | null;
  iconUrl?: string | null;
  isPinned?: boolean;
  sortOrder?: number;
};

/** 分类创建/更新入参。 */
export type CategoryInput = {
  name: string;
  parentId?: number | null;
  icon?: string | null;
  sortOrder?: number;
};

/**
 * 元数据抓取预览 DTO。对齐 worker `metadata.ts` 的 `MetadataShape`。
 * 完整版本，含 metadata 子对象；extension 端此前为简化版，
 * 收敛到此处后补回字段（行为增强，非破坏）。
 */
export type MetadataPreview = {
  url: string;
  title: string;
  description: string;
  iconUrl: string;
  keywords: string[];
  language: string;
  partial?: boolean;
  metadata: {
    page_url: string;
    canonical_url: string;
    keywords: string[];
    language: string;
    open_graph: Record<string, unknown>;
  };
};

/** 设置 DTO。对齐 worker `settings.ts` 的 `SettingsConfig`。 */
export type Settings = {
  faviconProxyUrl: string;
  faviconProxyEnabled: boolean;
};

/** 导入导出格式。 */
export type TransferFormat = 'html' | 'json';

/** 导入策略。 */
export type ImportStrategy = 'skip' | 'create' | 'update';

/** 导入结果摘要。 */
export type ImportSummary = {
  categoriesCreated: number;
  categoriesReused: number;
  bookmarksCreated: number;
  bookmarksSkipped: number;
  bookmarksUpdated: number;
  errors: string[];
};
