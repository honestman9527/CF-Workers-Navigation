import type { ViewDensity } from '@shared';
import type { CSSProperties } from 'react';

import type { CategoryNode } from '@nav/features/categories/tree';
import type { Bookmark, Category, Tag } from '@shared/api/types';

import type { BookmarkFeedCache } from './bookmarkFeedCache';
import type { BookmarkFeed } from './useBookmarkFeed';

import { Popover } from '@base-ui/react/popover';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  GripVertical,
  Hash,
  Inbox,
  LockKeyhole,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { useSortableList } from '@/lib/sortable';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@nav/api/client';
import { categoryIcon } from '@nav/features/categories/icons';
import { domainOf } from '@shared/search';

import { categorySectionId } from './categoryBrowse';
import { FrontButton } from './controls';
import { FrontBookmarkCopyPicker } from './FrontBookmarkCopyPicker';

export type BookmarkActions = {
  authed: boolean;
  density?: ViewDensity;
  pendingIds: ReadonlySet<number>;
  categories: Category[];
  tags?: Tag[];
  activeTag?: string;
  cache: BookmarkFeedCache;
  onEdit: (bookmark: Bookmark) => void;
  onCopy: (bookmark: Bookmark, categoryId: number | null) => Promise<boolean> | void;
  onDelete?: (bookmark: Bookmark) => void;
  onSelectTag?: (tag: string) => void;
  onSelectCategory?: (slug: string) => void;
  onNotice?: (message: string) => void;
  onUnauthorized?: () => void;
};

function isTagSelected(tagName: string, activeTag?: string, allTags?: Tag[]): boolean {
  if (!activeTag) return false;
  const normalizedActive = activeTag.toLocaleLowerCase();
  const normalizedTag = tagName.toLocaleLowerCase();
  if (normalizedTag === normalizedActive) return true;
  const matched = allTags?.find((item) => item.slug.toLocaleLowerCase() === normalizedActive);
  return matched ? matched.name.toLocaleLowerCase() === normalizedTag : false;
}

function ExtraTagsPopover({
  bookmarkTitle,
  extraTags,
  activeTag,
  allTags,
  onSelectTag,
}: {
  bookmarkTitle: string;
  extraTags: string[];
  activeTag?: string;
  allTags?: Tag[];
  onSelectTag?: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`查看其余 ${extraTags.length} 个标签：${bookmarkTitle}`}
        title={`查看其余 ${extraTags.length} 个标签`}
        render={<button type="button" />}
        className="inline-flex min-h-6 cursor-pointer items-center rounded-md bg-secondary/75 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45 hover-capable:hover:bg-secondary hover-capable:hover:text-foreground"
      >
        +{extraTags.length}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={6} className="z-50 max-w-[calc(100vw-2rem)]">
          <Popover.Popup
            aria-label={`更多标签：${bookmarkTitle}`}
            className="front-surface glass-surface overlay-popup flex max-h-(--available-height) max-w-[min(18rem,calc(100vw-2rem))] origin-(--transform-origin) flex-wrap gap-1.5 overflow-y-auto rounded-2xl border border-border bg-popover p-2.5 text-popover-foreground shadow-xl outline-none"
          >
            {extraTags.map((tag) => {
              const active = isTagSelected(tag, activeTag, allTags);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setOpen(false);
                    onSelectTag?.(tag);
                  }}
                  title={active ? `点击取消标签筛选：${tag}` : `按标签筛选：${tag}`}
                  className="inline-flex max-w-40 cursor-pointer items-center gap-0.5 rounded-md border border-border/80 bg-background/80 px-2 py-1 text-xs text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45 aria-pressed:border-primary/45 aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-primary hover-capable:hover:border-primary/40 hover-capable:hover:bg-accent hover-capable:hover:text-primary"
                >
                  <Hash aria-hidden="true" className="size-3 shrink-0 opacity-70" />
                  <span className="truncate">{tag}</span>
                </button>
              );
            })}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SortModeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <FrontButton
      tone={active ? 'primary' : 'subtle'}
      aria-pressed={active}
      onClick={onToggle}
      className="min-h-8 gap-1.5 rounded-lg px-2.5 text-xs pointer-coarse:min-h-11"
    >
      <ArrowUpDown aria-hidden="true" className="size-3.5" />
      <span>{active ? '完成排序' : '排序'}</span>
    </FrontButton>
  );
}

export function FeedContent({
  feed,
  actions,
  highlighted = -1,
  showCategoryBadge = true,
  reorderable = false,
  sortMode = false,
  emptyMessage = '这里还没有网站',
}: {
  feed: BookmarkFeed;
  actions: BookmarkActions;
  highlighted?: number;
  showCategoryBadge?: boolean;
  reorderable?: boolean;
  sortMode?: boolean;
  emptyMessage?: string;
}) {
  const compact = actions.density === 'compact';
  const gridClass = compact
    ? 'grid grid-cols-1 gap-2.5 @sm:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4 @6xl:grid-cols-5'
    : 'grid grid-cols-1 gap-3.5 @lg:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4';
  const canReorder = Boolean(reorderable && actions.authed && feed.items.length > 1);
  const [savingOrder, setSavingOrder] = useState(false);
  const aliveRef = useRef(true);
  const feedRef = useRef(feed);
  const actionsRef = useRef(actions);

  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const handleOrderChange = useCallback((nextIds: number[], { commit }: { commit: boolean }) => {
    const currentFeed = feedRef.current;
    const previousIds = currentFeed.items.map((item) => item.id);
    currentFeed.setOrder(nextIds);
    if (!commit) return;

    const requestKey = currentFeed.key;
    setSavingOrder(true);
    void api
      .reorderBookmarks(nextIds)
      .then(() => {
        if (!aliveRef.current || feedRef.current.key !== requestKey) return;
        actionsRef.current.onNotice?.('排序已保存');
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          actionsRef.current.onUnauthorized?.();
          return;
        }
        if (!aliveRef.current || feedRef.current.key !== requestKey) return;
        feedRef.current.setOrder(previousIds);
        actionsRef.current.onNotice?.(error instanceof Error ? error.message : '排序保存失败');
      })
      .finally(() => {
        if (aliveRef.current) setSavingOrder(false);
      });
  }, []);

  const sortable = useSortableList({
    items: feed.items,
    enabled: canReorder && !savingOrder && !feed.loadingMore,
    layout: 'grid',
    getLabel: (item) => item.title,
    onChangeOrder: handleOrderChange,
  });

  function applyPreset(preset: 'name' | 'createdAsc' | 'createdDesc') {
    if (!canReorder || savingOrder || feed.loadingMore) return;
    const sorted = [...feed.items];
    if (preset === 'name') {
      sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN') || a.id - b.id);
    } else if (preset === 'createdAsc') {
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
    } else {
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
    }
    const label =
      preset === 'name'
        ? '已按名称排序'
        : preset === 'createdAsc'
          ? '已按添加顺序排序'
          : '已按最新添加排序';
    sortable.animateReorder(
      sorted.map((item) => item.id),
      `${label}，共 ${sorted.length} 项`,
    );
  }

  const ListTag = canReorder ? 'ol' : 'ul';

  return (
    <div className="@container">
      {canReorder ? (
        <p role="status" className="sr-only">
          {sortable.announcement}
        </p>
      ) : null}
      {canReorder && sortMode ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/55 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {feed.nextCursor ? (
              <span className="text-muted-foreground">
                仅对当前已加载的 {feed.items.length} 项排序，可先点击下方「展开更多」
              </span>
            ) : (
              <>
                <span className="mr-1 text-muted-foreground">一键排序：</span>
                <FrontButton
                  tone="subtle"
                  disabled={savingOrder || feed.loadingMore}
                  onClick={() => applyPreset('name')}
                  className="min-h-8 rounded-lg px-2.5 text-xs pointer-coarse:min-h-11"
                >
                  按名称
                </FrontButton>
                <FrontButton
                  tone="subtle"
                  disabled={savingOrder || feed.loadingMore}
                  onClick={() => applyPreset('createdAsc')}
                  className="min-h-8 rounded-lg px-2.5 text-xs pointer-coarse:min-h-11"
                >
                  按添加顺序
                </FrontButton>
                <FrontButton
                  tone="subtle"
                  disabled={savingOrder || feed.loadingMore}
                  onClick={() => applyPreset('createdDesc')}
                  className="min-h-8 rounded-lg px-2.5 text-xs pointer-coarse:min-h-11"
                >
                  按最新添加
                </FrontButton>
              </>
            )}
          </div>
          <span className="text-muted-foreground">
            {savingOrder ? '保存排序中…' : '拖拽手柄或按空格使用方向键排序'}
          </span>
        </div>
      ) : null}
      {feed.loading ? (
        <div role="status" aria-label="正在加载网站" className={gridClass}>
          {Array.from({ length: compact ? 6 : 4 }, (_, index) => (
            <div
              key={index}
              className={cn(
                'rounded-2xl border border-border bg-secondary/60 motion-safe:animate-pulse',
                compact ? 'h-[62px]' : 'h-[98px]',
              )}
            />
          ))}
        </div>
      ) : null}
      {feed.items.length > 0 ? (
        <ListTag
          role={canReorder ? 'list' : undefined}
          ref={canReorder ? sortable.setListRef : undefined}
          onFocus={canReorder ? sortable.onListFocus : undefined}
          className={cn(gridClass, canReorder && 'bookmark-sort-list relative')}
        >
          {feed.items.map((bookmark, index) => {
            const tags = bookmark.tags ?? [];
            const visibleTags = tags.slice(0, 3);
            const extraTags = tags.slice(3);
            const isPrivate = bookmark.effectiveVisibility === 'private';
            const privateLabel = bookmark.visibility === 'private' ? '私有' : '继承私有';
            const hasMetaRow =
              isPrivate || Boolean(bookmark.categoryName) || visibleTags.length > 0;
            const itemProps = canReorder ? sortable.getItemProps(bookmark.id) : undefined;
            const handleProps = canReorder ? sortable.getHandleProps(bookmark, index) : undefined;
            const isGrabbed = canReorder && sortable.grabbedId === bookmark.id;

            return (
              <li
                key={bookmark.id}
                {...itemProps}
                data-density={compact ? 'compact' : 'comfortable'}
                style={{ '--sibling-index': Math.min(index + 1, 12) } as CSSProperties}
                onPointerMove={(event) => {
                  if (event.pointerType !== 'mouse' || sortable.draggingId === bookmark.id) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  event.currentTarget.style.setProperty(
                    '--pointer-x',
                    `${event.clientX - rect.left}px`,
                  );
                  event.currentTarget.style.setProperty(
                    '--pointer-y',
                    `${event.clientY - rect.top}px`,
                  );
                }}
                className={cn(
                  'bookmark-card card-stagger-enter group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-border bg-background/75 shadow-2xs hover:border-primary/40 hover:bg-card hover:shadow-md dark:bg-secondary/55 dark:hover:bg-card',
                  canReorder && 'sortable-item',
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
                      'bookmark-card-icon grid shrink-0 place-items-center border border-border bg-secondary/80 group-hover:border-primary/25 dark:bg-background/60',
                      compact ? 'size-9 rounded-lg' : 'size-11 rounded-xl',
                    )}
                  >
                    <ImageWithFallback
                      src={bookmark.iconUrl}
                      loading={index < 8 ? 'eager' : 'lazy'}
                      width={compact ? 20 : 24}
                      height={compact ? 20 : 24}
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
                    {visibleTags.map((tag) => {
                      const active = isTagSelected(tag, actions.activeTag, actions.tags);
                      return (
                        <button
                          key={tag}
                          type="button"
                          aria-pressed={active}
                          onClick={() => actions.onSelectTag?.(tag)}
                          title={active ? `点击取消标签筛选：${tag}` : `按标签筛选：${tag}`}
                          className="inline-flex max-w-28 cursor-pointer items-center gap-0.5 rounded-md border border-border/80 bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors outline-none hover:border-primary/40 hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/45 aria-pressed:border-primary/45 aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-primary"
                        >
                          <Hash aria-hidden="true" className="size-2.5 shrink-0 opacity-70" />
                          <span className="truncate">{tag}</span>
                        </button>
                      );
                    })}
                    {extraTags.length > 0 ? (
                      <ExtraTagsPopover
                        bookmarkTitle={bookmark.title}
                        extraTags={extraTags}
                        activeTag={actions.activeTag}
                        allTags={actions.tags}
                        onSelectTag={actions.onSelectTag}
                      />
                    ) : null}
                  </div>
                ) : null}

                {actions.authed ? (
                  <div
                    className={cn(
                      'flex shrink-0 items-center justify-end gap-1 border-t border-border/70 pt-2',
                      canReorder && sortMode
                        ? 'opacity-100'
                        : 'sm:hover-capable:pointer-events-none sm:hover-capable:absolute sm:hover-capable:top-2.5 sm:hover-capable:right-2.5 sm:hover-capable:z-10 sm:hover-capable:gap-0.5 sm:hover-capable:rounded-xl sm:hover-capable:border sm:hover-capable:border-border sm:hover-capable:bg-popover/95 sm:hover-capable:p-1 sm:hover-capable:opacity-0 sm:hover-capable:shadow-md sm:hover-capable:backdrop-blur-md sm:hover-capable:transition-opacity sm:hover-capable:duration-150 sm:hover-capable:group-focus-within:pointer-events-auto sm:hover-capable:group-focus-within:opacity-100 sm:hover-capable:group-hover:pointer-events-auto sm:hover-capable:group-hover:opacity-100 sm:hover-capable:has-[[data-popup-open]]:pointer-events-auto sm:hover-capable:has-[[data-popup-open]]:opacity-100',
                    )}
                  >
                    {canReorder && handleProps ? (
                      <FrontButton
                        {...handleProps}
                        title="拖拽或按空格调整顺序"
                        className="drag-handle min-h-11 min-w-11 rounded-lg px-0 sm:hover-capable:min-h-8 sm:hover-capable:w-8 sm:hover-capable:min-w-8"
                      >
                        <GripVertical aria-hidden="true" className="size-3.5" />
                      </FrontButton>
                    ) : null}
                    {canReorder && sortMode ? (
                      <>
                        <FrontButton
                          ref={sortable.registerMoveButton(bookmark.id, -1)}
                          className="min-h-11 min-w-11 rounded-lg px-0 sm:hover-capable:min-h-8 sm:hover-capable:w-8 sm:hover-capable:min-w-8"
                          aria-label={`前移：${bookmark.title}`}
                          title="前移一位"
                          disabled={index === 0 || savingOrder || feed.loadingMore}
                          onClick={() => sortable.moveBy(bookmark.id, -1)}
                        >
                          <ChevronLeft aria-hidden="true" className="size-3.5" />
                        </FrontButton>
                        <FrontButton
                          ref={sortable.registerMoveButton(bookmark.id, 1)}
                          className="min-h-11 min-w-11 rounded-lg px-0 sm:hover-capable:min-h-8 sm:hover-capable:w-8 sm:hover-capable:min-w-8"
                          aria-label={`后移：${bookmark.title}`}
                          title="后移一位"
                          disabled={
                            index === feed.items.length - 1 || savingOrder || feed.loadingMore
                          }
                          onClick={() => sortable.moveBy(bookmark.id, 1)}
                        >
                          <ChevronRight aria-hidden="true" className="size-3.5" />
                        </FrontButton>
                      </>
                    ) : (
                      <>
                        <FrontBookmarkCopyPicker
                          bookmark={bookmark}
                          categories={actions.categories}
                          disabled={actions.pendingIds.has(bookmark.id)}
                          onCopy={(categoryId) => actions.onCopy(bookmark, categoryId)}
                        />
                        <FrontButton
                          className="min-h-11 min-w-11 rounded-lg px-0 sm:hover-capable:min-h-8 sm:hover-capable:w-8 sm:hover-capable:min-w-8"
                          aria-label={`编辑：${bookmark.title}`}
                          title="编辑书签"
                          onClick={() => actions.onEdit(bookmark)}
                        >
                          <Pencil aria-hidden="true" className="size-3.5" />
                        </FrontButton>
                        {actions.onDelete ? (
                          <FrontButton
                            className="min-h-11 min-w-11 rounded-lg px-0 text-muted-foreground hover:bg-destructive/12 hover:text-destructive sm:hover-capable:min-h-8 sm:hover-capable:w-8 sm:hover-capable:min-w-8"
                            aria-label={`删除：${bookmark.title}`}
                            title="移入回收站"
                            disabled={actions.pendingIds.has(bookmark.id)}
                            onClick={() => actions.onDelete?.(bookmark)}
                          >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                          </FrontButton>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
                {canReorder && sortMode ? (
                  <p
                    aria-hidden="true"
                    className={cn(
                      'text-[11px] text-primary',
                      isGrabbed ? 'block font-medium' : 'hidden group-focus-within:block',
                    )}
                  >
                    {isGrabbed ? '方向键移动 · 空格放置 · Esc 取消' : '空格调整顺序'}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ListTag>
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
  searching = false,
  reorderable = false,
  highlighted,
  activeQuery,
  activeTagLabel,
  activeUntagged = false,
  onRemoveQuery,
  onRemoveTag,
  onRemoveCategory,
  onClear,
}: {
  root?: CategoryNode;
  selectedSlug?: string;
  actions: BookmarkActions;
  feed: BookmarkFeed;
  searching?: boolean;
  reorderable?: boolean;
  highlighted?: number;
  activeQuery?: string;
  activeTagLabel?: string;
  activeUntagged?: boolean;
  onRemoveQuery?: () => void;
  onRemoveTag?: () => void;
  onRemoveCategory?: () => void;
  onClear: () => void;
}) {
  const [sortMode, setSortMode] = useState(false);
  const canReorder = reorderable && actions.authed && feed.items.length > 1;
  const title = root?.name ?? (selectedSlug === 'uncategorized' ? '未分类' : '全部书签');
  const Icon = root ? categoryIcon(root.icon) : Inbox;
  const hasCategoryFilter = Boolean(root || selectedSlug === 'uncategorized');
  const showActiveChips =
    searching &&
    Boolean(
      (hasCategoryFilter && onRemoveCategory) ||
      (activeQuery && onRemoveQuery) ||
      (activeTagLabel && onRemoveTag) ||
      (activeUntagged && onRemoveTag),
    );
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
          <h2
            tabIndex={-1}
            className="min-w-0 text-lg font-semibold tracking-tight wrap-break-word sm:text-xl"
          >
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
          {canReorder ? (
            <SortModeToggle active={sortMode} onToggle={() => setSortMode((prev) => !prev)} />
          ) : null}
          {feed.loaded ? (
            <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums">
              {feed.items.length}
              {feed.nextCursor ? '+' : ''} 项
            </span>
          ) : null}
        </div>
      </div>
      {showActiveChips ? (
        <div
          role="group"
          aria-label="当前筛选条件"
          className="mb-4 flex flex-wrap items-center gap-2"
        >
          {hasCategoryFilter && onRemoveCategory ? (
            <button
              type="button"
              onClick={onRemoveCategory}
              aria-label="在全部书签中搜索"
              className="inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-secondary/80 px-2.5 text-xs text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45 pointer-coarse:min-h-9 hover-capable:hover:border-primary/40 hover-capable:hover:bg-accent"
            >
              <Folder aria-hidden="true" className="size-3 text-muted-foreground" />
              <span className="max-w-40 truncate">范围：{title}</span>
              <X aria-hidden="true" className="size-3 text-muted-foreground" />
            </button>
          ) : null}
          {activeQuery && onRemoveQuery ? (
            <button
              type="button"
              onClick={onRemoveQuery}
              aria-label="移除关键词筛选"
              className="inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-secondary/80 px-2.5 text-xs text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45 pointer-coarse:min-h-9 hover-capable:hover:border-primary/40 hover-capable:hover:bg-accent"
            >
              <span className="max-w-48 truncate">关键词：{activeQuery}</span>
              <X aria-hidden="true" className="size-3 text-muted-foreground" />
            </button>
          ) : null}
          {activeTagLabel && onRemoveTag ? (
            <button
              type="button"
              onClick={onRemoveTag}
              aria-label={`移除标签筛选：${activeTagLabel}`}
              className="inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-full border border-primary/35 bg-accent px-2.5 text-xs font-medium text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45 pointer-coarse:min-h-9 hover-capable:hover:border-primary/60"
            >
              <Hash aria-hidden="true" className="size-3 shrink-0" />
              <span className="max-w-40 truncate">{activeTagLabel}</span>
              <X aria-hidden="true" className="size-3 shrink-0" />
            </button>
          ) : null}
          {activeUntagged && onRemoveTag ? (
            <button
              type="button"
              onClick={onRemoveTag}
              aria-label="移除无标签筛选"
              className="inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full border border-primary/35 bg-accent px-2.5 text-xs font-medium text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45 pointer-coarse:min-h-9 hover-capable:hover:border-primary/60"
            >
              <span>无标签</span>
              <X aria-hidden="true" className="size-3 shrink-0" />
            </button>
          ) : null}
        </div>
      ) : null}
      <FeedContent
        feed={feed}
        actions={actions}
        highlighted={searching ? highlighted : undefined}
        showCategoryBadge
        reorderable={reorderable}
        sortMode={sortMode && canReorder}
        emptyMessage={
          searching ? '没有找到匹配的网站，请调整关键词或筛选。' : '这个分类还没有网站。'
        }
      />
    </section>
  );
}
