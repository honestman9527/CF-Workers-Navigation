import type { Category } from '@shared/api/types';

import { ChevronRight, FolderPlus, LockKeyhole } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { VisibilityBadge } from '@nav/features/visibility/VisibilityField';
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
  compact = false,
  showLevel = false,
  showCount = false,
  includeUncategorized = false,
  className,
}: {
  categories: Category[];
  selectedSlug?: string;
  onSelect: (slug: string) => void;
  /** 显示 LV1/LV2… 层级徽标。 */
  showLevel?: boolean;
  /** 书签柜紧凑布局，不显示层级和权限文字徽标。 */
  compact?: boolean;
  /** 显示直属书签计数。 */
  showCount?: boolean;
  /** 顶部附加「未分类」入口。 */
  includeUncategorized?: boolean;
  className?: string;
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
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground',
            selectedSlug === UNCATEGORIZED_SLUG && 'bg-primary/10 font-medium text-primary',
          )}
        >
          <FolderPlus className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">未分类</span>
        </button>
      ) : null}
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          compact={compact}
          node={node}
          depth={0}
          expanded={expanded}
          selectedSlug={selectedSlug}
          showLevel={showLevel}
          showCount={showCount}
          onSelect={onSelect}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  compact,
  depth,
  expanded,
  selectedSlug,
  showLevel,
  showCount,
  onSelect,
  onToggle,
}: {
  node: CategoryNode;
  compact: boolean;
  depth: number;
  expanded: Set<number>;
  selectedSlug?: string;
  showLevel: boolean;
  showCount: boolean;
  onSelect: (slug: string) => void;
  onToggle: (id: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedSlug === node.slug;
  const Icon = categoryIcon(node.icon);

  if (compact) {
    const privacy =
      node.effectiveVisibility === 'private'
        ? node.visibility === 'private'
          ? '私有'
          : '受上级分类限制'
        : '';
    const label = [node.name, privacy].filter(Boolean).join('，');
    return (
      <div className="min-w-0">
        <div className="flex min-w-0 items-center">
          <Tooltip>
            <TooltipTrigger
              render={<button type="button" />}
              onClick={() => onSelect(node.slug)}
              aria-label={`${label}${showCount ? `，${node.bookmarkCount} 条直属书签` : ''}`}
              aria-current={isSelected ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                isSelected && 'bg-primary/10 font-medium text-primary',
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {privacy ? <LockKeyhole aria-hidden="true" className="size-3 shrink-0" /> : null}
              {showCount ? (
                <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-70">
                  {node.bookmarkCount}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
            </TooltipTrigger>
            <TooltipContent side="right" className="break-words">
              {label}
            </TooltipContent>
          </Tooltip>
          {hasChildren ? (
            <button
              type="button"
              aria-label={`${isExpanded ? '收起' : '展开'}分类：${node.name}`}
              aria-expanded={isExpanded}
              onClick={() => onToggle(node.id)}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight
                className={cn(
                  'size-3.5 transition-transform motion-reduce:transition-none',
                  isExpanded && 'rotate-90',
                )}
              />
            </button>
          ) : (
            <span className="w-7 shrink-0" />
          )}
        </div>
        {hasChildren && isExpanded ? (
          <div
            className={cn(
              'flex min-w-0 flex-col gap-0.5',
              depth < 4 && 'ml-2 border-l border-border/70 pl-[3px]',
            )}
          >
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                compact
                node={child}
                depth={depth + 1}
                expanded={expanded}
                selectedSlug={selectedSlug}
                showLevel={false}
                showCount={showCount}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-0.5 pr-1">
        <button
          type="button"
          onClick={() => onSelect(node.slug)}
          aria-current={isSelected ? 'page' : undefined}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground',
            depth > 0 && 'py-1.5 text-xs',
            isSelected && 'bg-primary/10 font-medium text-primary',
          )}
        >
          <Icon
            className={cn(
              'size-3.5 shrink-0',
              isSelected ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <VisibilityBadge item={node} />
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
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
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
        <div className="relative mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-border/70 pl-2.5">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              compact={compact}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedSlug={selectedSlug}
              showLevel={showLevel}
              showCount={showCount}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
