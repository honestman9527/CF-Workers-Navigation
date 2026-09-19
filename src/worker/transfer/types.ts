import type { Visibility } from '../../shared/api/types';
export type TransferBookmark = {
  visibility?: Visibility;
  title: string;
  url: string;
  description?: string | null;
  iconUrl?: string | null;
  isPinned?: boolean;
  categorySlug?: string | null;
  tags: string[];
  archivedAt?: string | null;
  deletedAt?: string | null;
  addedAt?: string | null;
};

export type TransferCategory = {
  visibility?: Visibility;
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
