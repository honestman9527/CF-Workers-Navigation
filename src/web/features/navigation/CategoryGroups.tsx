import type { CategoryNode } from '@nav/features/categories/tree';

import type { BookmarkActions } from './BookmarkSection';

import { LockKeyhole } from 'lucide-react';
import { useState } from 'react';

import { categoryIcon } from '@nav/features/categories/icons';

import { FeedContent, SortModeToggle } from './BookmarkSection';
import { categorySectionId } from './categoryBrowse';
import { useBookmarkFeed } from './useBookmarkFeed';

/** 仅挂载当前一级；每组独立分页，页面缓存跨一级切换保留。 */
export function CategoryGroups({
  root,
  selectedSlug,
  actions,
  version,
  onUnauthorized,
}: {
  root: CategoryNode;
  selectedSlug?: string;
  actions: BookmarkActions;
  version: number;
  onUnauthorized: () => void;
}) {
  const Icon = categoryIcon(root.icon);
  return (
    <section
      id={categorySectionId(root.slug)}
      aria-label={root.name}
      className="glass-surface rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6"
    >
      <div className="mb-6 flex min-w-0 flex-wrap items-center gap-2.5">
        <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <h2 className="min-w-0 text-lg font-semibold tracking-tight wrap-break-word sm:text-xl">
          {root.name}
        </h2>
        {root.effectiveVisibility === 'private' ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/25 bg-accent px-2 py-0.5 text-xs font-medium text-primary">
            <LockKeyhole aria-hidden="true" className="size-3" />
            私有
          </span>
        ) : null}
      </div>
      <div className="space-y-7 sm:space-y-8">
        {[root, ...root.children].map((category, index) => (
          <CategoryGroup
            key={category.id}
            category={category}
            direct={category.id === root.id}
            deferred={index >= 2}
            hideEmpty={category.id === root.id && root.children.length > 0}
            selected={selectedSlug === category.slug && category.id !== root.id}
            actions={actions}
            version={version}
            onUnauthorized={onUnauthorized}
          />
        ))}
      </div>
    </section>
  );
}

function CategoryGroup({
  category,
  direct,
  deferred,
  hideEmpty,
  selected,
  actions,
  version,
  onUnauthorized,
}: {
  category: CategoryNode;
  direct: boolean;
  deferred: boolean;
  hideEmpty: boolean;
  selected: boolean;
  actions: BookmarkActions;
  version: number;
  onUnauthorized: () => void;
}) {
  const [sortMode, setSortMode] = useState(false);
  const feed = useBookmarkFeed({
    category: category.slug,
    categoryOnly: true,
    coordinator: actions.cache,
    cacheVisited: true,
    version,
    onUnauthorized,
  });
  const title = direct ? '直属书签' : category.name;
  const canReorder = actions.authed && feed.items.length > 1;
  // 无直属书签时不占据一个空分组；二级分类始终保留标题和空状态。
  if (hideEmpty && feed.loaded && !feed.items.length) return null;
  return (
    <section
      id={direct ? `${categorySectionId(category.slug)}-direct` : categorySectionId(category.slug)}
      aria-label={title}
      aria-current={selected ? 'location' : undefined}
      className={deferred ? 'deferred-group scroll-mt-20' : 'scroll-mt-20'}
    >
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 text-sm font-semibold wrap-break-word text-foreground sm:text-base">
            {title}
          </h3>
          {!direct && category.effectiveVisibility === 'private' ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/25 bg-accent px-1.5 py-0.5 text-[11px] font-medium text-primary">
              <LockKeyhole aria-hidden="true" className="size-3" />
              私有
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canReorder ? (
            <SortModeToggle active={sortMode} onToggle={() => setSortMode((prev) => !prev)} />
          ) : null}
          {feed.loaded ? (
            <span className="shrink-0 rounded-md bg-secondary/80 px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
              {feed.items.length}
              {feed.nextCursor ? '+' : ''} 项
            </span>
          ) : null}
        </div>
      </div>
      <FeedContent
        feed={feed}
        actions={actions}
        showCategoryBadge={false}
        reorderable
        sortMode={sortMode && canReorder}
        emptyMessage="这个分类还没有网站。"
      />
    </section>
  );
}
