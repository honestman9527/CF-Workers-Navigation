import type { CategoryNode } from '@nav/features/categories/tree';
import type { Bookmark } from '@shared/api/types';

import type { BookmarkFeedCache } from './bookmarkFeedCache';
import type { BookmarkFeed } from './useBookmarkFeed';

import { Inbox, Pencil, Star } from 'lucide-react';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { cn } from '@/lib/utils';
import { categoryIcon } from '@nav/features/categories/icons';
import { domainOf } from '@shared/search';

import { categoryPath, categorySectionId } from './categoryBrowse';
import { CategoryNavigation } from './CategoryNavigation';
import { FrontButton } from './controls';

export type BookmarkActions = {
  authed: boolean;
  pendingIds: ReadonlySet<number>;
  cache: BookmarkFeedCache;
  onEdit: (bookmark: Bookmark) => void;
  onPin: (bookmark: Bookmark) => void;
};

export function FeedContent({
  feed,
  actions,
  highlighted = -1,
  emptyMessage = '这里还没有网站',
}: {
  feed: BookmarkFeed;
  actions: BookmarkActions;
  highlighted?: number;
  emptyMessage?: string;
}) {
  return (
    <>
      {feed.loading ? (
        <div
          role="status"
          aria-label="正在加载网站"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-[68px] rounded-xl border border-border/40 bg-secondary/45"
            />
          ))}
        </div>
      ) : null}
      {feed.items.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {feed.items.map((bookmark, index) => {
            return (
              <li
                key={bookmark.id}
                className={cn(
                  'group relative flex min-w-0 items-center gap-2 rounded-xl border border-border/45 bg-background/90 p-3 transition-colors hover:border-primary/40 hover:bg-accent/45 dark:bg-secondary/35 dark:hover:bg-secondary/65',
                  highlighted === index && 'border-primary bg-accent ring-2 ring-primary/25',
                )}
              >
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`打开 ${bookmark.title}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary/80 dark:bg-card">
                    <ImageWithFallback
                      src={bookmark.iconUrl}
                      loading="lazy"
                      className="size-6 rounded-md object-contain"
                      fallback={
                        <span className="text-base font-semibold text-primary">
                          {bookmark.title.charAt(0).toUpperCase()}
                        </span>
                      }
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[15px] leading-5 font-semibold text-foreground"
                      title={bookmark.title}
                    >
                      {bookmark.title}
                    </span>
                    <span
                      className="mt-1 block truncate text-xs leading-4 text-muted-foreground"
                      title={bookmark.description ?? bookmark.url}
                    >
                      {bookmark.description || domainOf(bookmark.url)}
                    </span>
                  </span>
                </a>
                {actions.authed ? (
                  <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                    <FrontButton
                      className="min-h-11 w-11 rounded-lg px-0 sm:min-h-8 sm:w-8"
                      aria-label={`${bookmark.isPinned ? '取消常用' : '加入常用'}：${bookmark.title}`}
                      aria-pressed={bookmark.isPinned}
                      disabled={actions.pendingIds.has(bookmark.id)}
                      onClick={() => actions.onPin(bookmark)}
                    >
                      <Star
                        className={cn('size-3.5', bookmark.isPinned && 'fill-current text-primary')}
                      />
                    </FrontButton>
                    <FrontButton
                      className="min-h-11 w-11 rounded-lg px-0 sm:min-h-8 sm:w-8"
                      aria-label={`编辑：${bookmark.title}`}
                      onClick={() => actions.onEdit(bookmark)}
                    >
                      <Pencil className="size-3.5" />
                    </FrontButton>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {feed.loaded && feed.items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : null}
      {feed.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 py-3 text-sm text-destructive"
        >
          <span>{feed.error}</span>
          <FrontButton onClick={feed.retry}>重试</FrontButton>
        </div>
      ) : null}
      {feed.nextCursor && !feed.error ? (
        <div className="mt-4 flex justify-center">
          <FrontButton
            tone="subtle"
            onClick={() => void feed.loadMore()}
            disabled={feed.loadingMore}
            className="text-primary"
          >
            {feed.loadingMore ? '加载中…' : '展开更多'}
          </FrontButton>
        </div>
      ) : null}
    </>
  );
}

export function BookmarkSection({
  root,
  selectedSlug,
  actions,
  feed,
  pinned = false,
  searching = false,
  highlighted,
  onSelect,
  onClear,
}: {
  root?: CategoryNode;
  selectedSlug?: string;
  actions: BookmarkActions;
  feed: BookmarkFeed;
  pinned?: boolean;
  searching?: boolean;
  highlighted?: number;
  onSelect: (slug: string) => void;
  onClear: () => void;
}) {
  const title =
    root?.name ??
    (selectedSlug === 'uncategorized' ? '未分类' : searching ? '全部书签' : '常用网站');
  const Icon = pinned ? Star : root ? categoryIcon(root.icon) : Inbox;
  return (
    <section
      id={categorySectionId(
        root?.slug ?? (selectedSlug === 'uncategorized' ? selectedSlug : undefined),
      )}
      aria-label={searching ? '站内搜索结果' : title}
      className="rounded-2xl border border-border/45 bg-card/80 p-5 sm:p-6 dark:bg-card/55"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <h2 tabIndex={-1} className="text-lg font-semibold tracking-tight sm:text-xl">
            {title}
          </h2>
        </div>
        {searching ? (
          <FrontButton tone="subtle" onClick={onClear}>
            清除搜索与筛选
          </FrontButton>
        ) : null}
        {feed.loaded ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {feed.items.length}
            {feed.nextCursor ? '+' : ''} 项
          </span>
        ) : null}
      </div>
      {root && root.children.length ? (
        <CategoryNavigation
          key={root.slug}
          path={categoryPath([root], selectedSlug)}
          onSelect={onSelect}
        />
      ) : null}
      <FeedContent
        feed={feed}
        actions={actions}
        highlighted={searching ? highlighted : undefined}
        emptyMessage={
          searching
            ? '没有找到匹配的网站，请调整关键词或筛选。'
            : pinned
              ? '将网站加入常用，即可在这里快速打开。'
              : '这个分类还没有网站。'
        }
      />
    </section>
  );
}
