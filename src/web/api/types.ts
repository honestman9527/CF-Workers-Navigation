export type {
  Bookmark,
  CategoryNode,
  BookmarkInput,
  CategoryInput,
  MetadataPreview,
  Settings,
  TransferFormat,
  ImportStrategy,
  ImportSummary,
} from '@shared/api/types';

/** Web 导出 adapter 的浏览器结果，不进入跨运行时契约。 */
export type ExportResult = {
  blob: Blob;
  filename: string;
};
