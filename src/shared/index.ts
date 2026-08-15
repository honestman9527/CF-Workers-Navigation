/**
 * 共享契约层统一出口。
 *
 * 引用方式：
 * - Web / Worker / extension：从 `@shared` 或其子路径导入。
 *
 * 仅 re-export，不在此处增加逻辑。
 */

export * from './api/types';
export * from './api/endpoints';
export * from './api/client';
export * from './errors';
export * from './theme';
