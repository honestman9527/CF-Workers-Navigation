import type { CategoryNode } from '@nav/features/categories/tree';
import type { Bookmark } from '@shared/api/types';

import type { BookmarkFeedCache } from './bookmarkFeedCache';

import { Inbox, Pencil, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { cn } from '@/lib/utils';
import { categoryIcon } from '@nav/features/categories/icons';
import { domainOf } from '@shared/search';

import { categoryPath, categorySectionId } from './categoryBrowse';
import { CategoryNavigation } from './CategoryNavigation';
import { FrontButton } from './controls';
import { type BookmarkFeed, useBookmarkFeed } from './useBookmarkFeed';

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
  version,
  pinned = false,
  active = false,
  onSelect,
  onUnauthorized,
}: {
  root?: CategoryNode;
  selectedSlug?: string;
  actions: BookmarkActions;
  version: number;
  pinned?: boolean;
  active?: boolean;
  onSelect: (slug: string) => void;
  onUnauthorized: () => void;
}) {
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(pinned);
  const path = root ? categoryPath([root], selectedSlug) : [];
  const selected = path[path.length - 1] ?? root;
  const slug = pinned ? 'common' : root ? `category-${root.slug}` : 'uncategorized';
  const category = pinned ? undefined : (selected?.slug ?? 'uncategorized');
  const Icon = pinned ? Star : root ? categoryIcon(root.icon) : Inbox;
  const feed = useBookmarkFeed({
    coordinator: actions.cache,
    pinned: pinned || undefined,
    category,
    enabled: visible || active,
    cacheVisited: true,
    version,
    onUnauthorized,
  });
  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, [visible]);
  return (
    <section
      ref={section}
      id={categorySectionId(pinned ? undefined : (root?.slug ?? 'uncategorized'))}
      aria-labelledby={`heading-${slug}`}
      className={cn(
        'scroll-mt-24 rounded-2xl border border-border/45 bg-card/80 p-5 sm:p-6 dark:bg-card/55',
        active && 'border-primary/35',
      )}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <h2
            id={`heading-${slug}`}
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight sm:text-xl"
          >
            {pinned ? '常用网站' : (root?.name ?? '未分类')}
          </h2>
        </div>
        {feed.loaded ? (
          <span className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {feed.items.length}
            {feed.nextCursor ? '+' : ''} 项
          </span>
        ) : null}
      </div>
      {root && (root.children.length > 0 || path.length > 1) ? (
        <CategoryNavigation
          key={selected?.slug}
          path={path.length ? path : [root]}
          onSelect={onSelect}
        />
      ) : null}
      <FeedContent
        feed={feed}
        actions={actions}
        emptyMessage={pinned ? '将网站加入常用，即可在这里快速打开。' : '这个分类还没有网站。'}
      />
    </section>
  );
}
