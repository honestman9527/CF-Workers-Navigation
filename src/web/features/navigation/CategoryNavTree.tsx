import type { CategoryNode } from '@nav/features/categories/tree';

import { ChevronRight, Inbox, LockKeyhole, Star } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { categoryIcon } from '@nav/features/categories/icons';

import { FrontButton } from './controls';

/**
 * 桌面侧栏与移动端左侧抽屉共用的两级分类导航树。
 * 折叠/展开按钮不携带文本，计数通过 data-count 伪元素展示，
 * 确保一级按钮文本稳定为分类名称且可访问性语义清晰。
 */
export function CategoryNavTree({
  roots,
  totals,
  activeRoot,
  selectedCategory,
  searching,
  onSelectCategory,
  label = '分类导航',
}: {
  roots: CategoryNode[];
  totals: Map<number, number>;
  activeRoot?: string;
  selectedCategory?: string;
  searching: boolean;
  onSelectCategory: (slug?: string) => void;
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

  return (
    <nav aria-label={label} className="scrollbar-safe flex-1 overflow-y-auto overscroll-contain">
      <div className="mb-2 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        分类工作台
      </div>
      <div className="flex flex-col gap-1">
        <FrontButton
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
                <FrontButton
                  aria-current={isActive ? 'location' : undefined}
                  onClick={() => onSelectCategory(root.slug)}
                  data-count={count > 0 ? count : undefined}
                  className={cn(
                    'min-h-10 min-w-0 flex-1 justify-start gap-2.5 px-2.5 text-sm whitespace-nowrap after:ml-auto after:rounded-md after:px-1.5 after:py-0.5 after:text-[11px] after:font-normal after:text-muted-foreground after:tabular-nums after:content-[attr(data-count)]',
                    isActive
                      ? 'bg-accent font-semibold text-primary after:text-primary/80 hover:bg-accent'
                      : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">{root.name}</span>
                  {isPrivate ? (
                    <LockKeyhole aria-label="私有分类" className="size-3.5 shrink-0 opacity-75" />
                  ) : null}
                </FrontButton>
              </div>

              {isExpanded ? (
                <div className="ml-5 flex flex-col gap-0.5 border-l border-border pl-2.5">
                  {root.children.map((child) => {
                    const childActive = selectedCategory === child.slug;
                    const childCount = child.bookmarkCount ?? 0;
                    const childPrivate = child.effectiveVisibility === 'private';
                    return (
                      <FrontButton
                        key={child.id}
                        aria-current={childActive ? 'location' : undefined}
                        onClick={() => onSelectCategory(child.slug)}
                        data-count={childCount > 0 ? childCount : undefined}
                        className={cn(
                          'min-h-9 w-full justify-start gap-2 rounded-lg px-2.5 text-xs whitespace-nowrap after:ml-auto after:text-[11px] after:font-normal after:text-muted-foreground after:tabular-nums after:content-[attr(data-count)]',
                          childActive
                            ? 'bg-accent font-semibold text-primary after:text-primary/80 hover:bg-accent'
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
