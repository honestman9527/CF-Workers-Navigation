import type { Bookmark } from '@shared/api/types';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { domainOf } from '@shared/search';

/** 常用项与搜索项共用展示内容，外层各自保留链接或键盘选择行为。 */
export function LauncherBookmarkContent({ bookmark }: { bookmark: Bookmark }) {
  return (
    <>
      <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-muted">
        <ImageWithFallback
          src={bookmark.iconUrl}
          className="size-6 rounded"
          loading="lazy"
          fallback={
            <span className="text-base font-semibold text-primary">
              {(bookmark.title.charAt(0) || '?').toUpperCase()}
            </span>
          }
        />
      </span>
      <span className="w-full min-w-0">
        <span className="block truncate text-sm font-medium" title={bookmark.title}>
          {bookmark.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground" title={bookmark.url}>
          {domainOf(bookmark.url)}
        </span>
      </span>
    </>
  );
}
