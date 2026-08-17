/**
 * 书签元数据抓取公开入口。
 * 实现拆分为 `./metadata/` 下的 cohesive 模块，本文件仅保留对外 API。
 */
export { fetchBookmarkMetadata } from './metadata/parse';
export type { FaviconOpts, MetadataResult, MetadataShape } from './metadata/types';
