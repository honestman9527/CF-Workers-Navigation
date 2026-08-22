/** 跨端 API DTO：Worker、Web、extension 的唯一契约。 */

import type { SearchEngine } from '../search';

/** 保留的「未分类」筛选值：任何分类 slug 不得与之相同。 */
export const UNCATEGORIZED_SLUG = 'uncategorized';

export type Bookmark = {
  id: number;
  title: string;
  url: string;
  description: string | null;
  iconUrl: string | null;
  isPinned: boolean;
  categoryId: number | null;
  categorySlug: string | null;
  categoryName: string | null;
  tags: string[];
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookmarkInput = {
  title: string;
  url: string;
  description?: string | null;
  iconUrl?: string | null;
  isPinned?: boolean;
  categoryId?: number | null;
  tags?: string[];
};

export type BookmarkView = 'active' | 'archive' | 'trash' | 'all';

export type BookmarkListOptions = {
  view?: BookmarkView;
  category?: string;
  tag?: string;
  pinned?: boolean;
  cursor?: string;
  limit?: number;
};

export type BookmarkPage = {
  items: Bookmark[];
  nextCursor: string | null;
};

export type Tag = { id: number; name: string; slug: string; bookmarkCount: number };

export type Category = {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  /** 该分类下直属活动书签数。 */
  bookmarkCount: number;
};

export type CategoryInput = {
  name: string;
  parentId?: number | null;
  icon?: string | null;
};

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

export type FaviconPreview = {
  url: string;
  iconUrl: string;
  source: 'proxy' | 'none';
};

export type Settings = {
  faviconProxyUrl: string;
  faviconProxyEnabled: boolean;
  /** 搜索引擎列表（Web 启动台 / 扩展共用契约）。 */
  searchEngines: SearchEngine[];
  /** 默认搜索引擎 id，须存在于 searchEngines。 */
  defaultEngineId: string;
  /** 启动台与工作区背景图片（空串表示不启用）。 */
  backgroundImageUrl: string;
  /** 是否启用背景图片。 */
  backgroundImageEnabled: boolean;
};

/** 管理后台概览统计。 */
export type AdminStats = {
  bookmarks: {
    total: number;
    active: number;
    archived: number;
    trash: number;
  };
  categories: number;
  tags: number;
};

export type TransferFormat = 'html' | 'json';
export type ImportStrategy = 'skip' | 'create' | 'update';

export type ImportSummary = {
  bookmarksCreated: number;
  bookmarksSkipped: number;
  bookmarksUpdated: number;
  errors: string[];
};
