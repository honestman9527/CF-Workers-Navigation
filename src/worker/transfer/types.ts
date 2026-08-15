export type TransferBookmark = {
  title: string;
  url: string;
  description?: string | null;
  iconUrl?: string | null;
  isPinned?: boolean;
  sortOrder?: number;
  addedAt?: string | null;
};

export type TransferCategory = {
  name: string;
  slug?: string;
  icon?: string | null;
  sortOrder?: number;
  children: TransferCategory[];
  bookmarks: TransferBookmark[];
};

export type TransferData = {
  exportedAt: string;
  categories: TransferCategory[];
};

export type { ImportStrategy, ImportSummary } from '../../shared/api/types';

export type ExportFormat = 'html' | 'json';
export type ImportFormat = 'html' | 'json';
