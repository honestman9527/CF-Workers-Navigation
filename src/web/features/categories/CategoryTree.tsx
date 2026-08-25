import type { Category } from '@shared/api/types';

import { ChevronRight, FolderPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

import { categoryIcon } from './icons';
import { ancestorIds, buildCategoryTree, type CategoryNode } from './tree';

/**
 * 通用可折叠分类树（单选）：分级折叠 + 可选 LV1/LV2… 层级徽标与书签计数。
 * 展开状态组件内自持，选中变化时自动展开祖先路径。
 */
export function CategoryTree({
  categories,
  selectedSlug,
  onSelect,
  showLevel = false,
  showCount = false,
  includeUncategorized = false,
  className,
  rowClass,
}: {
  categories: Category[];
  selectedSlug?: string;
  onSelect: (slug: string) => void;
  /** 显示 LV1/LV2… 层级徽标。 */
  showLevel?: boolean;
  /** 显示直属书签计数。 */
  showCount?: boolean;
  /** 顶部附加「未分类」入口。 */
  includeUncategorized?: boolean;
  className?: string;
  /** 选择行附加样式（覆盖默认观感，如侧栏 nav-item 系）。 */
  rowClass?: string;
}) {
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // 选中变化时保持祖先展开，便于看到所处路径。
  useEffect(() => {
    const ids = ancestorIds(categories, selectedSlug);
    if (ids.length > 0) {
      setExpanded((prev) => new Set([...prev, ...ids]));
    }
  }, [categories, selectedSlug]);

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className={cn('grid gap-1', className)}>
      {includeUncategorized ? (
        <button
          type="button"
          onClick={() => onSelect(UNCATEGORIZED_SLUG)}
          className={cn(
            'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground',
            selectedSlug === UNCATEGORIZED_SLUG && 'bg-primary/10 font-medium text-primary',
            rowClass,
          )}
        >
          <FolderPlus className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">未分类</span>
        </button>
      ) : null}
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          selectedSlug={selectedSlug}
          showLevel={showLevel}
          showCount={showCount}
          rowClass={rowClass}
          onSelect={onSelect}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  expanded,
  selectedSlug,
  showLevel,
  showCount,
  rowClass,
  onSelect,
  onToggle,
}: {
  node: CategoryNode;
  depth: number;
  expanded: Set<number>;
  selectedSlug?: string;
  showLevel: boolean;
  showCount: boolean;
  rowClass?: string;
  onSelect: (slug: string) => void;
  onToggle: (id: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedSlug === node.slug;
  const Icon = categoryIcon(node.icon);

  return (
    <div className="relative">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onSelect(node.slug)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground',
            depth > 0 && 'py-1.5 text-xs',
            isSelected && 'bg-primary/10 font-medium text-primary',
            rowClass,
          )}
        >
          <Icon
            className={cn(
              'size-3.5 shrink-0',
              isSelected ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {showLevel ? (
            <span className="shrink-0 rounded bg-muted px-1 font-mono text-[9px] leading-4 text-muted-foreground/80">
              LV{depth + 1}
            </span>
          ) : null}
          {showCount ? (
            <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-70">
              {node.bookmarkCount}
            </span>
          ) : null}
        </button>
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? '收起分类' : '展开分类'}
            aria-expanded={isExpanded}
            onClick={() => onToggle(node.id)}
            className="grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                'size-3.5 transition-transform duration-150',
                isExpanded && 'rotate-90',
              )}
            />
          </button>
        ) : null}
      </div>
      {hasChildren && isExpanded ? (
        <div className="relative mt-0.5 ml-4 space-y-0.5 border-l border-border/70 pl-2.5">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedSlug={selectedSlug}
              showLevel={showLevel}
              showCount={showCount}
              rowClass={rowClass}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
