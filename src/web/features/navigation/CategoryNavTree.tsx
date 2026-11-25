import type { CategoryNode } from '@nav/features/categories/tree';

import { ChevronRight, Inbox, LockKeyhole, Star } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { categoryIcon } from '@nav/features/categories/icons';

import { FrontButton } from './controls';
import { FrontTooltip } from './FrontTooltip';

/**
 * 桌面侧栏（支持展开态两级树与折叠态紧凑图标栏）与移动端左侧抽屉共用的分类导航。
 * 计数使用真实 DOM 节点紧邻按钮呈现（非 CSS content 伪元素，符合 WCAG F87），
 * 同时保持按钮自身文本稳定为分类名称，点击整行热区无死角。
 */
export function CategoryNavTree({
  roots,
  totals,
  activeRoot,
  selectedCategory,
  searching,
  onSelectCategory,
  collapsed = false,
  label = '分类导航',
}: {
  roots: CategoryNode[];
  totals: Map<number, number>;
  activeRoot?: string;
  selectedCategory?: string;
  searching: boolean;
  onSelectCategory: (slug?: string) => void;
  collapsed?: boolean;
  label?: string;
}) {
  const activeRootNode = roots.find((item) => item.slug === activeRoot);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(() =>
    activeRootNode && activeRootNode.children.length > 0 ? new Set([activeRootNode.id]) : new Set(),
  );

  // 切换到带子分类的一级或二级时，自动展开对应父级，便于定位。
  useEffect(() => {
    if (!activeRootNode || activeRootNode.children.length === 0) return;
    setExpandedIds((prev) => {
      if (prev.has(activeRootNode.id)) return prev;
      const next = new Set(prev);
      next.add(activeRootNode.id);
      return next;
    });
  }, [activeRootNode]);

  function toggleRoot(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (collapsed) {
    return (
      <nav
        aria-label={label}
        data-collapsed="true"
        className="scrollbar-rail flex flex-1 scroll-edge-fade flex-col items-center gap-1.5 overflow-x-hidden overflow-y-auto overscroll-contain py-1"
      >
        <FrontTooltip content="常用">
          <FrontButton
            aria-label="常用"
            aria-current={!selectedCategory && !searching ? 'location' : undefined}
            onClick={() => onSelectCategory()}
            className={cn(
              'size-11 rounded-xl p-0',
              !selectedCategory && !searching
                ? 'bg-accent font-semibold text-primary hover:bg-accent'
                : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
            )}
          >
            <Star aria-hidden="true" className="size-4 shrink-0" />
          </FrontButton>
        </FrontTooltip>

        {roots.map((root) => {
          const Icon = categoryIcon(root.icon);
          const isActive = activeRoot === root.slug;
          const count = totals.get(root.id) ?? root.bookmarkCount ?? 0;
          const isPrivate = root.effectiveVisibility === 'private';
          const tooltipContent = (
            <span className="flex items-center gap-1.5">
              <span>{root.name}</span>
              {isPrivate ? <LockKeyhole aria-hidden="true" className="size-3 opacity-80" /> : null}
              {count > 0 ? <span className="tabular-nums opacity-75">{count}</span> : null}
            </span>
          );

          return (
            <FrontTooltip key={root.id} content={tooltipContent}>
              <FrontButton
                aria-label={isPrivate ? `${root.name}（私有分类）` : root.name}
                aria-current={isActive ? 'location' : undefined}
                onClick={() => onSelectCategory(root.slug)}
                className={cn(
                  'relative size-11 rounded-xl p-0',
                  isActive
                    ? 'bg-accent font-semibold text-primary hover:bg-accent'
                    : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {isPrivate ? (
                  <LockKeyhole
                    aria-hidden="true"
                    className="absolute right-1.5 bottom-1.5 size-2.5 text-primary"
                  />
                ) : null}
              </FrontButton>
            </FrontTooltip>
          );
        })}

        <FrontTooltip content="未分类">
          <FrontButton
            aria-label="未分类"
            aria-current={selectedCategory === 'uncategorized' ? 'location' : undefined}
            onClick={() => onSelectCategory('uncategorized')}
            className={cn(
              'size-11 rounded-xl p-0',
              selectedCategory === 'uncategorized'
                ? 'bg-accent font-semibold text-primary hover:bg-accent'
                : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
            )}
          >
            <Inbox aria-hidden="true" className="size-4 shrink-0" />
          </FrontButton>
        </FrontTooltip>
      </nav>
    );
  }

  return (
    <nav
      aria-label={label}
      className="scrollbar-safe flex-1 scroll-edge-fade overflow-y-auto overscroll-contain"
    >
      <div className="mb-2 px-2.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
        分类工作台
      </div>
      <div className="flex flex-col gap-1">
        <FrontButton
          aria-current={!selectedCategory && !searching ? 'location' : undefined}
          onClick={() => onSelectCategory()}
          className={cn(
            'min-h-10 w-full justify-start gap-2.5 px-3 text-sm whitespace-nowrap',
            !selectedCategory && !searching
              ? 'bg-accent font-semibold text-primary hover:bg-accent'
              : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
          )}
        >
          <Star aria-hidden="true" className="size-4 shrink-0" />
          常用
        </FrontButton>

        {roots.map((root) => {
          const Icon = categoryIcon(root.icon);
          const isActive = activeRoot === root.slug;
          const count = totals.get(root.id) ?? root.bookmarkCount ?? 0;
          const hasChildren = root.children.length > 0;
          const isExpanded = hasChildren && expandedIds.has(root.id);
          const isPrivate = root.effectiveVisibility === 'private';

          return (
            <div key={root.id} className="flex flex-col gap-0.5">
              <div className="group/cat flex min-w-0 items-center gap-0.5">
                {hasChildren ? (
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? '收起' : '展开'} ${root.name}`}
                    onClick={() => toggleRoot(root.id)}
                    className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        'size-3.5 transition-transform duration-150',
                        isExpanded && 'rotate-90',
                      )}
                    />
                  </button>
                ) : (
                  <span aria-hidden="true" className="w-2 shrink-0" />
                )}
                <div className="relative flex min-w-0 flex-1 items-center">
                  <FrontButton
                    aria-current={isActive ? 'location' : undefined}
                    onClick={() => onSelectCategory(root.slug)}
                    className={cn(
                      'min-h-10 min-w-0 flex-1 justify-start gap-2.5 px-2.5 text-sm whitespace-nowrap',
                      count > 0 && 'pr-9',
                      isActive
                        ? 'bg-accent font-semibold text-primary hover:bg-accent'
                        : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className="truncate">{root.name}</span>
                    {isPrivate ? (
                      <LockKeyhole aria-label="私有分类" className="size-3.5 shrink-0 opacity-75" />
                    ) : null}
                  </FrontButton>
                  {count > 0 ? (
                    <span
                      aria-label={`${count} 项`}
                      className={cn(
                        'pointer-events-none absolute right-2.5 rounded-md px-1 py-0.5 text-[0.6875rem] font-normal tabular-nums',
                        isActive ? 'text-primary/80' : 'text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </div>
              </div>

              {isExpanded ? (
                <div className="ml-5 flex flex-col gap-0.5 border-l border-border pl-2.5">
                  {root.children.map((child) => {
                    const childActive = selectedCategory === child.slug;
                    const childCount = child.bookmarkCount ?? 0;
                    const childPrivate = child.effectiveVisibility === 'private';
                    return (
                      <div key={child.id} className="relative flex min-w-0 items-center">
                        <FrontButton
                          aria-current={childActive ? 'location' : undefined}
                          onClick={() => onSelectCategory(child.slug)}
                          className={cn(
                            'min-h-9 w-full justify-start gap-2 rounded-lg px-2.5 text-xs whitespace-nowrap',
                            childCount > 0 && 'pr-8',
                            childActive
                              ? 'bg-accent font-semibold text-primary hover:bg-accent'
                              : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'size-1.5 shrink-0 rounded-full',
                              childActive ? 'bg-primary' : 'bg-border-strong',
                            )}
                          />
                          <span className="truncate">{child.name}</span>
                          {childPrivate ? (
                            <LockKeyhole
                              aria-label="私有分类"
                              className="size-3 shrink-0 opacity-75"
                            />
                          ) : null}
                        </FrontButton>
                        {childCount > 0 ? (
                          <span
                            aria-label={`${childCount} 项`}
                            className={cn(
                              'pointer-events-none absolute right-2.5 text-[0.6875rem] font-normal tabular-nums',
                              childActive ? 'text-primary/80' : 'text-muted-foreground',
                            )}
                          >
                            {childCount}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        <FrontButton
          onClick={() => onSelectCategory('uncategorized')}
          aria-current={selectedCategory === 'uncategorized' ? 'location' : undefined}
          className={cn(
            'min-h-10 w-full justify-start gap-2.5 px-3 text-sm whitespace-nowrap',
            selectedCategory === 'uncategorized'
              ? 'bg-accent font-semibold text-primary hover:bg-accent'
              : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
          )}
        >
          <Inbox aria-hidden="true" className="size-4 shrink-0" />
          未分类
        </FrontButton>
      </div>
    </nav>
  );
}
