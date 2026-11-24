import type { ViewDensity } from '@shared';

import type { CategoryNode } from '@nav/features/categories/tree';
import type { Bookmark } from '@shared/api/types';

import type { BookmarkFeedCache } from './bookmarkFeedCache';
import type { BookmarkFeed } from './useBookmarkFeed';

import { Folder, Hash, Inbox, LockKeyhole, Pencil, Star, Trash2 } from 'lucide-react';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { cn } from '@/lib/utils';
import { categoryIcon } from '@nav/features/categories/icons';
import { domainOf } from '@shared/search';

import { categorySectionId } from './categoryBrowse';
import { FrontButton } from './controls';

export type BookmarkActions = {
  authed: boolean;
  density?: ViewDensity;
  pendingIds: ReadonlySet<number>;
  cache: BookmarkFeedCache;
  onEdit: (bookmark: Bookmark) => void;
  onPin: (bookmark: Bookmark) => void;
  onDelete?: (bookmark: Bookmark) => void;
  onSelectTag?: (tag: string) => void;
  onSelectCategory?: (slug: string) => void;
};

export function FeedContent({
  feed,
  actions,
  highlighted = -1,
  showCategoryBadge = true,
  emptyMessage = '这里还没有网站',
}: {
  feed: BookmarkFeed;
  actions: BookmarkActions;
  highlighted?: number;
  showCategoryBadge?: boolean;
  emptyMessage?: string;
}) {
  const compact = actions.density === 'compact';
  const gridClass = compact
    ? 'grid grid-cols-1 gap-2.5 @sm:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4 @6xl:grid-cols-5'
    : 'grid grid-cols-1 gap-3.5 @lg:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4';

  return (
    <div className="@container">
      {feed.loading ? (
        <div role="status" aria-label="正在加载网站" className={gridClass}>
          {Array.from({ length: compact ? 6 : 4 }, (_, index) => (
            <div
              key={index}
              className={cn(
                'animate-pulse rounded-2xl border border-border bg-secondary/60',
                compact ? 'h-[62px]' : 'h-[98px]',
              )}
            />
          ))}
        </div>
      ) : null}
      {feed.items.length > 0 ? (
        <ul className={gridClass}>
          {feed.items.map((bookmark, index) => {
            const tags = bookmark.tags ?? [];
            const visibleTags = tags.slice(0, 3);
            const extraTagCount = Math.max(0, tags.length - 3);
            const isPrivate = bookmark.effectiveVisibility === 'private';
            const privateLabel = bookmark.visibility === 'private' ? '私有' : '继承私有';
            const hasMetaRow =
              isPrivate || Boolean(bookmark.categoryName) || visibleTags.length > 0;

            return (
              <li
                key={bookmark.id}
                data-density={compact ? 'compact' : 'comfortable'}
                className={cn(
                  'group relative flex min-w-0 flex-col justify-between rounded-2xl border border-border bg-background/75 shadow-2xs transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-md dark:bg-secondary/55 dark:hover:bg-card',
                  compact ? 'gap-2 p-3' : 'gap-3 p-4',
                  highlighted === index &&
                    'border-primary bg-accent ring-2 ring-primary/25 dark:bg-accent',
                )}
              >
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`打开 ${bookmark.title}`}
                  className="flex min-w-0 items-start gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                >
                  <span
                    className={cn(
                      'grid shrink-0 place-items-center border border-border bg-secondary/80 transition-colors group-hover:border-primary/25 dark:bg-background/60',
                      compact ? 'size-9 rounded-lg' : 'size-11 rounded-xl',
                    )}
                  >
                    <ImageWithFallback
                      src={bookmark.iconUrl}
                      loading="lazy"
                      className={cn('rounded-md object-contain', compact ? 'size-5' : 'size-6')}
                      fallback={
                        <span
                          className={cn(
                            'font-semibold text-primary',
                            compact ? 'text-sm' : 'text-base',
                          )}
                        >
                          {bookmark.title.charAt(0).toUpperCase()}
                        </span>
                      }
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          'truncate font-semibold text-foreground transition-colors group-hover:text-primary',
                          compact ? 'text-sm leading-5' : 'text-[15px] leading-5',
                        )}
                        title={bookmark.title}
                      >
                        {bookmark.title}
                      </span>
                      {bookmark.isPinned ? (
                        <Star
                          aria-label="常用书签"
                          className="size-3.5 shrink-0 fill-current text-primary"
                        />
                      ) : null}
                    </span>
                    <span
                      className={cn('mt-1 block truncate text-xs leading-4 text-muted-foreground')}
                      title={bookmark.description ?? bookmark.url}
                    >
                      {bookmark.description || domainOf(bookmark.url)}
                    </span>
                  </span>
                </a>

                {hasMetaRow ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {isPrivate ? (
                      <span
                        title={
                          bookmark.visibility === 'private'
                            ? '私有书签，仅管理员可见'
                            : '受上级私有分类限制，仅管理员可见'
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-accent px-1.5 py-0.5 text-[11px] font-medium text-primary"
                      >
                        <LockKeyhole aria-hidden="true" className="size-3 shrink-0" />
                        {privateLabel}
                      </span>
                    ) : null}
                    {bookmark.categoryName ? (
                      showCategoryBadge && bookmark.categorySlug && actions.onSelectCategory ? (
                        <button
                          type="button"
                          onClick={() => actions.onSelectCategory?.(bookmark.categorySlug!)}
                          title={`查看分类：${bookmark.categoryName}`}
                          className="inline-flex max-w-36 cursor-pointer items-center gap-1 rounded-md border border-border bg-secondary/80 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
                        >
                          <Folder aria-hidden="true" className="size-3 shrink-0" />
                          <span className="truncate">{bookmark.categoryName}</span>
                        </button>
                      ) : (
                        <span
                          title={bookmark.categoryName}
                          className="inline-flex max-w-36 items-center gap-1 rounded-md bg-secondary/75 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          <Folder aria-hidden="true" className="size-3 shrink-0" />
                          <span className="truncate">{bookmark.categoryName}</span>
                        </span>
                      )
                    ) : null}
                    {visibleTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => actions.onSelectTag?.(tag)}
                        title={`按标签筛选：${tag}`}
                        className="inline-flex max-w-28 cursor-pointer items-center gap-0.5 rounded-md border border-border/80 bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-primary"
                      >
                        <Hash aria-hidden="true" className="size-2.5 shrink-0 opacity-70" />
                        <span className="truncate">{tag}</span>
                      </button>
                    ))}
                    {extraTagCount > 0 ? (
                      <span className="rounded-md bg-secondary/75 px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                        +{extraTagCount}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {actions.authed ? (
                  <div
                    className={cn(
                      'flex shrink-0 items-center justify-end gap-1 border-t border-border/70 pt-2 sm:[@media(hover:hover)]:pointer-events-none sm:[@media(hover:hover)]:absolute sm:[@media(hover:hover)]:top-2.5 sm:[@media(hover:hover)]:right-2.5 sm:[@media(hover:hover)]:z-10 sm:[@media(hover:hover)]:gap-0.5 sm:[@media(hover:hover)]:rounded-xl sm:[@media(hover:hover)]:border sm:[@media(hover:hover)]:border-border sm:[@media(hover:hover)]:bg-popover/95 sm:[@media(hover:hover)]:p-1 sm:[@media(hover:hover)]:opacity-0 sm:[@media(hover:hover)]:shadow-md sm:[@media(hover:hover)]:backdrop-blur-md sm:[@media(hover:hover)]:transition-opacity sm:[@media(hover:hover)]:duration-150 sm:[@media(hover:hover)]:group-focus-within:pointer-events-auto sm:[@media(hover:hover)]:group-focus-within:opacity-100 sm:[@media(hover:hover)]:group-hover:pointer-events-auto sm:[@media(hover:hover)]:group-hover:opacity-100',
                    )}
                  >
                    <FrontButton
                      className="min-h-11 min-w-11 rounded-lg px-0 sm:[@media(hover:hover)]:min-h-8 sm:[@media(hover:hover)]:w-8 sm:[@media(hover:hover)]:min-w-8"
                      aria-label={`${bookmark.isPinned ? '取消常用' : '加入常用'}：${bookmark.title}`}
                      aria-pressed={bookmark.isPinned}
                      title={bookmark.isPinned ? '取消常用' : '加入常用'}
                      disabled={actions.pendingIds.has(bookmark.id)}
                      onClick={() => actions.onPin(bookmark)}
                    >
                      <Star
                        aria-hidden="true"
                        className={cn('size-3.5', bookmark.isPinned && 'fill-current text-primary')}
                      />
                    </FrontButton>
                    <FrontButton
                      className="min-h-11 min-w-11 rounded-lg px-0 sm:[@media(hover:hover)]:min-h-8 sm:[@media(hover:hover)]:w-8 sm:[@media(hover:hover)]:min-w-8"
                      aria-label={`编辑：${bookmark.title}`}
                      title="编辑书签"
                      onClick={() => actions.onEdit(bookmark)}
                    >
                      <Pencil aria-hidden="true" className="size-3.5" />
                    </FrontButton>
                    {actions.onDelete ? (
                      <FrontButton
                        className="min-h-11 min-w-11 rounded-lg px-0 text-muted-foreground hover:bg-destructive/12 hover:text-destructive sm:[@media(hover:hover)]:min-h-8 sm:[@media(hover:hover)]:w-8 sm:[@media(hover:hover)]:min-w-8"
                        aria-label={`删除：${bookmark.title}`}
                        title="移入回收站"
                        disabled={actions.pendingIds.has(bookmark.id)}
                        onClick={() => actions.onDelete?.(bookmark)}
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </FrontButton>
                    ) : null}
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
    </div>
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
  onClear,
}: {
  root?: CategoryNode;
  selectedSlug?: string;
  actions: BookmarkActions;
  feed: BookmarkFeed;
  pinned?: boolean;
  searching?: boolean;
  highlighted?: number;
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
      className="glass-surface rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <h2 tabIndex={-1} className="truncate text-lg font-semibold tracking-tight sm:text-xl">
            {title}
          </h2>
          {root?.effectiveVisibility === 'private' ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/25 bg-accent px-2 py-0.5 text-xs font-medium text-primary">
              <LockKeyhole aria-hidden="true" className="size-3" />
              私有
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2.5">
          {searching ? (
            <FrontButton tone="subtle" className="min-h-9 px-3 text-xs" onClick={onClear}>
              清除搜索与筛选
            </FrontButton>
          ) : null}
          {feed.loaded ? (
            <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums">
              {feed.items.length}
              {feed.nextCursor ? '+' : ''} 项
            </span>
          ) : null}
        </div>
      </div>
      <FeedContent
        feed={feed}
        actions={actions}
        highlighted={searching ? highlighted : undefined}
        showCategoryBadge
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
