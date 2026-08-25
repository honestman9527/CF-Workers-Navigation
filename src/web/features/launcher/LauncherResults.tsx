import type { Bookmark } from '@shared/api/types';
import type { SearchEngine } from '@shared/search';

import { Globe, Search, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { domainOf } from '@shared/search';

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
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [bookmark.iconUrl]);
  const icon =
    failed || !bookmark.iconUrl ? (
      <span className="text-base font-semibold text-primary">
        {(bookmark.title.charAt(0) || '?').toUpperCase()}
      </span>
    ) : (
      <img
        src={bookmark.iconUrl}
        alt=""
        className="size-6 rounded"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );

  return (
    <button
      type="button"
      onMouseEnter={onHighlight}
      onClick={onOpen}
      className={cn(
        'group flex min-w-0 flex-col items-center gap-2.5 rounded-[1.1rem] border border-border/70 bg-card p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-soft',
        highlighted && 'border-primary/60 ring-2 ring-primary/30',
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-border/70 bg-muted">
        {icon}
      </span>
      <span className="w-full min-w-0">
        <span className="block truncate text-sm font-medium">{bookmark.title}</span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">
          {domainOf(bookmark.url)}
        </span>
      </span>
    </button>
  );
}

/**
 * 启动台搜索结果区：与「常用网站」瓦片同款样式（favicon 瓦片网格），
 * 占同一主区域位置；末位附「搜索引擎搜索」瓦片。
 */
export function LauncherResults({
  results,
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
        <span className="font-mono text-[10px] text-muted-foreground">{results.length}</span>
      </div>

      {loading ? (
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-[1.1rem] bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="w-full rounded-[1.1rem] border border-border/70 bg-card px-6 py-8 text-center">
          <TriangleAlert className="mx-auto size-6 text-destructive" />
          <p className="mt-3 text-sm font-medium">无法连接 Nav 服务</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
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
        <div className="w-full rounded-[1.1rem] border border-dashed border-border bg-card/60 px-6 py-10 text-center">
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
                'group flex min-w-0 flex-col items-center justify-center gap-2.5 rounded-[1.1rem] border border-dashed border-border/70 bg-card/60 p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-soft',
                highlighted === listLen && 'border-primary/60 ring-2 ring-primary/30',
              )}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-border/70 bg-muted">
                <Globe className="size-5 text-primary" />
              </span>
              <span className="w-full min-w-0">
                <span className="block truncate text-sm font-medium">
                  在 {activeEngine?.name} 中搜索
                </span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  «{searchQuery}»
                </span>
              </span>
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
