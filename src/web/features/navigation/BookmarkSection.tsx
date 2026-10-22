import type { CategoryNode } from '@nav/features/categories/tree';
import type { Bookmark } from '@shared/api/types';

import type { BookmarkFeedCache } from './bookmarkFeedCache';

import { Pencil, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { cn } from '@/lib/utils';
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
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-xl bg-secondary/60 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : null}
      {feed.items.length > 0 ? (
        <ul className="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {feed.items.map((bookmark, index) => {
            return (
              <li
                key={bookmark.id}
                className={cn(
                  'group flex min-w-0 items-center gap-1 rounded-[1.125rem] p-3 transition-colors hover:bg-card',
                  highlighted === index && 'bg-accent ring-2 ring-primary/30',
                )}
              >
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`打开 ${bookmark.title}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card">
                    <ImageWithFallback
                      src={bookmark.iconUrl}
                      loading="lazy"
                      className="size-7 rounded-md object-contain"
                      fallback={
                        <span className="text-lg font-semibold text-primary">
                          {bookmark.title.charAt(0).toUpperCase()}
                        </span>
                      }
                    />
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block truncate text-[15px] leading-6 font-semibold"
                      title={bookmark.title}
                    >
                      {bookmark.title}
                    </span>
                    <span
                      className="block truncate text-xs leading-5 text-muted-foreground"
                      title={bookmark.description ?? bookmark.url}
                    >
                      {bookmark.description || domainOf(bookmark.url)}
                    </span>
                  </span>
                </a>
                {actions.authed ? (
                  <div className="flex shrink-0 flex-col sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                    <FrontButton
                      className="min-h-11 w-11 px-0 sm:min-h-8 sm:w-8"
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
                      className="min-h-11 w-11 px-0 sm:min-h-8 sm:w-8"
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
        <p className="py-6 text-sm text-muted-foreground">{emptyMessage}</p>
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
        <div className="mt-3 flex justify-center">
          <FrontButton
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
      className="min-h-48 scroll-mt-24 border-t border-border/50 py-8 sm:py-10"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-3">
        <h2
          id={`heading-${slug}`}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight sm:text-2xl"
        >
          {pinned ? '常用网站' : (root?.name ?? '未分类')}
        </h2>
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
