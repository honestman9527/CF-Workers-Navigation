import type { CategorySystemKey, Visibility } from '../../shared/api/types';
export type TransferBookmark = {
  visibility?: Visibility;
  title: string;
  url: string;
  description?: string | null;
  iconUrl?: string | null;
  /** 仅保留用于兼容旧版 JSON 备份导入时自动迁移至内置「常用」分类。 */
  isPinned?: boolean;
  sortOrder?: number;
  categorySlug?: string | null;
  tags: string[];
  archivedAt?: string | null;
  deletedAt?: string | null;
  addedAt?: string | null;
};

export type TransferCategory = {
  visibility?: Visibility;
  systemKey?: CategorySystemKey | null;
  name: string;
  slug?: string;
  icon?: string | null;
  parentSlug?: string | null;
};

export type TransferData = {
  version: 1 | 2;
  exportedAt: string;
  bookmarks: TransferBookmark[];
  categories?: TransferCategory[];
};

export type { ImportStrategy, ImportSummary } from '../../shared/api/types';

export type ExportFormat = 'html' | 'json';
