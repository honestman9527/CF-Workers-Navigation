/** 跨端 API DTO：Worker、Web、extension 的唯一契约。 */

export type Bookmark = {
  id: number;
  title: string;
  url: string;
  description: string | null;
  iconUrl: string | null;
  isPinned: boolean;
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
  tags?: string[];
};

export type BookmarkView = 'active' | 'archive' | 'trash' | 'all';

export type BookmarkListOptions = {
  view?: BookmarkView;
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
};

export type TransferFormat = 'html' | 'json';
export type ImportStrategy = 'skip' | 'create' | 'update';

export type ImportSummary = {
  bookmarksCreated: number;
  bookmarksSkipped: number;
  bookmarksUpdated: number;
  errors: string[];
};
