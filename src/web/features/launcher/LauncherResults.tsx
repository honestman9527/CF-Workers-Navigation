import type { Bookmark } from '@shared/api/types';
import type { SearchEngine } from '@shared/search';

import { Globe, LoaderCircle, Search, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { LauncherBookmarkContent } from './LauncherBookmarkContent';

function ResultTile({
  bookmark,
  highlighted,
  onHighlight,
  onOpen,
}: {
  bookmark: Bookmark;
  highlighted: boolean;
  onHighlight: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHighlight}
      onClick={onOpen}
      className={cn(
        'group flex min-w-0 flex-col items-center gap-2.5 rounded-lg border border-border bg-card p-4 text-center transition hover:-translate-y-0.5 hover:border-primary',
        highlighted && 'border-primary/60 ring-2 ring-primary/30',
      )}
    >
      <LauncherBookmarkContent bookmark={bookmark} />
    </button>
  );
}

/**
 * 启动台搜索结果区：与「常用网站」瓦片同款样式（favicon 瓦片网格），
 * 占同一主区域位置；末位附「搜索引擎搜索」瓦片。
 */
export function LauncherResults({
  results,
  hasMore,
  loadingMore,
  onLoadMore,
  onRetry,
  loading,
  error,
  searchQuery,
  activeEngine,
  highlighted,
  onHighlightChange,
  onOpenBookmark,
  onWebSearch,
}: {
  results: Bookmark[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  activeEngine?: SearchEngine;
  highlighted: number;
  onHighlightChange: (index: number) => void;
  onOpenBookmark: (bookmark: Bookmark) => void;
  onWebSearch: () => void;
}) {
  const listLen = results.length;
  const showWebTile = Boolean(searchQuery);

  return (
    <section className="animate-launcher-enter w-full" aria-labelledby="launcher-results-heading">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Search className="size-4 text-primary" />
        <h2 id="launcher-results-heading" className="font-display text-sm font-semibold">
          搜索结果
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {results.length}
          {hasMore ? '+' : ''}
        </span>
      </div>

      {loading ? (
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : error && results.length === 0 ? (
        <div className="w-full rounded-lg border border-border bg-card px-6 py-8 text-center">
          <TriangleAlert className="mx-auto size-6 text-destructive" />
          <p className="mt-3 text-sm font-medium">书签搜索失败</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            重试
          </Button>
          {showWebTile ? (
            <button
              type="button"
              onClick={onWebSearch}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Globe className="size-3.5" />在 {activeEngine?.name} 中搜索
            </button>
          ) : null}
        </div>
      ) : results.length === 0 ? (
        <div className="w-full rounded-lg border border-dashed border-border bg-card/60 px-6 py-10 text-center">
          <Search className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">未找到匹配的书签</p>
          {showWebTile ? (
            <button
              type="button"
              onClick={onWebSearch}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Globe className="size-3.5" />在 {activeEngine?.name} 中搜索「{searchQuery}」
            </button>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              换个关键词，或到书签柜里新建一个书签。
            </p>
          )}
        </div>
      ) : (
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
          {results.map((bookmark, index) => (
            <ResultTile
              key={bookmark.id}
              bookmark={bookmark}
              highlighted={highlighted === index}
              onHighlight={() => onHighlightChange(index)}
              onOpen={() => onOpenBookmark(bookmark)}
            />
          ))}
          {showWebTile ? (
            <button
              type="button"
              onMouseEnter={() => onHighlightChange(listLen)}
              onClick={onWebSearch}
              className={cn(
                'group flex min-w-0 flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border bg-card/60 p-4 text-center transition hover:-translate-y-0.5 hover:border-primary',
                highlighted === listLen && 'border-primary/60 ring-2 ring-primary/30',
              )}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-muted">
                <Globe className="size-5 text-primary" />
              </span>
              <span className="w-full min-w-0">
                <span className="block truncate text-sm font-medium">
                  在 {activeEngine?.name} 中搜索
                </span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  «{searchQuery}»
                </span>
              </span>
            </button>
          ) : null}
          {hasMore ? (
            <Button
              type="button"
              variant="outline"
              disabled={loadingMore}
              onMouseEnter={() => onHighlightChange(listLen + (showWebTile ? 1 : 0))}
              onClick={onLoadMore}
              className={cn(
                'h-full min-h-28 flex-col gap-2',
                highlighted === listLen + (showWebTile ? 1 : 0) &&
                  'border-primary/60 ring-2 ring-primary/30',
              )}
            >
              {loadingMore ? <LoaderCircle className="animate-spin" /> : <Search />}
              {loadingMore ? '加载中…' : '加载更多结果'}
            </Button>
          ) : null}
        </div>
      )}
      {error && results.length > 0 ? (
        <p className="mt-3 text-center text-xs text-destructive">{error}，请重试加载</p>
      ) : null}
    </section>
  );
}
