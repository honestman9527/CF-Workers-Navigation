import type { Category } from '@shared/api/types';

import { ChevronRight, FolderPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

import { categoryIcon } from './icons';
import { ancestorIds, buildCategoryTree, type CategoryNode } from './tree';

export function CategorySidebar({
  categories,
  selectedSlug,
  onSelect,
}: {
  categories: Category[];
  selectedSlug?: string;
  onSelect: (slug: string) => void;
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
    <div className="grid max-h-[min(38vh,26rem)] gap-1 overflow-y-auto pr-1">
      <button
        type="button"
        onClick={() => onSelect(UNCATEGORIZED_SLUG)}
        className={cn(
          'nav-item rounded-xl px-3 py-2',
          selectedSlug === UNCATEGORIZED_SLUG && 'nav-item-active',
        )}
      >
        <FolderPlus className="size-3.5" />
        <span className="truncate">未分类</span>
      </button>
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          selectedSlug={selectedSlug}
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
  onSelect,
  onToggle,
}: {
  node: CategoryNode;
  depth: number;
  expanded: Set<number>;
  selectedSlug?: string;
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
            'nav-item min-w-0 flex-1 rounded-xl px-2.5 py-2 transition-all',
            depth > 0 && 'py-1.5 text-xs',
            isSelected && 'nav-item-active',
          )}
        >
          <Icon
            className={cn(
              'size-3.5 shrink-0',
              isSelected ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-70">
            {node.bookmarkCount}
          </span>
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
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
