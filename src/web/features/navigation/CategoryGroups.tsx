import type { CategoryNode } from '@nav/features/categories/tree';

import type { BookmarkActions } from './BookmarkSection';

import { categoryIcon } from '@nav/features/categories/icons';

import { FeedContent } from './BookmarkSection';
import { categorySectionId } from './categoryBrowse';
import { useBookmarkFeed } from './useBookmarkFeed';

/** 仅挂载当前一级；每组独立分页，页面缓存跨一级切换保留。 */
export function CategoryGroups({
  root,
  selectedSlug,
  actions,
  version,
  pinnedVersion,
  onUnauthorized,
}: {
  root: CategoryNode;
  selectedSlug?: string;
  actions: BookmarkActions;
  version: number;
  pinnedVersion: number;
  onUnauthorized: () => void;
}) {
  const Icon = categoryIcon(root.icon);
  return (
    <section
      id={categorySectionId(root.slug)}
      aria-label={root.name}
      className="rounded-2xl border border-border/45 bg-card/80 p-5 sm:p-6 dark:bg-card/55"
    >
      <div className="mb-6 flex min-w-0 items-center gap-2.5">
        <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <h2 className="min-w-0 text-lg font-semibold tracking-tight break-words sm:text-xl">
          {root.name}
        </h2>
      </div>
      <div className="space-y-7 sm:space-y-8">
        {[root, ...root.children].map((category) => (
          <CategoryGroup
            key={category.id}
            category={category}
            direct={category.id === root.id}
            hideEmpty={category.id === root.id && root.children.length > 0}
            selected={selectedSlug === category.slug && category.id !== root.id}
            actions={actions}
            version={version}
            pinnedVersion={pinnedVersion}
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
  hideEmpty,
  selected,
  actions,
  version,
  pinnedVersion,
  onUnauthorized,
}: {
  category: CategoryNode;
  direct: boolean;
  hideEmpty: boolean;
  selected: boolean;
  actions: BookmarkActions;
  version: number;
  pinnedVersion: number;
  onUnauthorized: () => void;
}) {
  const feed = useBookmarkFeed({
    category: category.slug,
    categoryOnly: true,
    coordinator: actions.cache,
    cacheVisited: true,
    version,
    pinnedVersion,
    onUnauthorized,
  });
  const title = direct ? '直属书签' : category.name;
  // 无直属书签时不占据一个空分组；二级分类始终保留标题和空状态。
  if (hideEmpty && feed.loaded && !feed.items.length) return null;
  return (
    <section
      id={direct ? `${categorySectionId(category.slug)}-direct` : categorySectionId(category.slug)}
      aria-label={title}
      aria-current={selected ? 'location' : undefined}
      className="scroll-mt-6"
    >
      <div className="mb-3 flex min-w-0 items-baseline justify-between gap-3">
        <h3 className="min-w-0 text-sm font-semibold break-words text-foreground sm:text-base">
          {title}
        </h3>
        {feed.loaded ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {feed.items.length}
            {feed.nextCursor ? '+' : ''} 项
          </span>
        ) : null}
      </div>
      <FeedContent feed={feed} actions={actions} emptyMessage="这个分类还没有网站。" />
    </section>
  );
}
