import type { CategoryNode } from '@nav/features/categories/tree';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { FrontButton } from './controls';

export function CategoryNavigation({
  path,
  onSelect,
}: {
  path: CategoryNode[];
  onSelect: (slug: string) => void;
}) {
  const root = path[0];
  const current = path[path.length - 1];
  const choices = [{ ...root, name: '全部' }, ...root.children];
  const list = useRef<HTMLUListElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [visibleCount, setVisibleCount] = useState(choices.length);
  const childrenKey = JSON.stringify(choices.map((child) => [child.slug, child.name]));
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () => {
      const items = [...element.children] as HTMLElement[];
      const rows = [...new Set(items.map((item) => item.offsetTop))].sort((a, b) => a - b);
      const count = items.filter((item) => item.offsetTop < (rows[2] ?? Infinity)).length;
      setVisibleCount(count);
      setOverflow(rows.length > 2);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [childrenKey]);
  return (
    <div className="mb-4 flex flex-col gap-2.5 rounded-xl bg-secondary/45 p-3">
      {choices.length ? (
        <div className="flex flex-wrap items-start gap-2">
          <ul
            ref={list}
            id={`children-${root.id}`}
            aria-label={`${root.name}二级分类`}
            className={cn(
              'relative flex flex-1 flex-wrap gap-2',
              !expanded && 'max-h-28 overflow-hidden',
            )}
          >
            {choices.map((node, index) => (
              <li
                key={node.id}
                className="flex max-w-full"
                aria-hidden={!expanded && index >= visibleCount ? true : undefined}
              >
                <FrontButton
                  tone="subtle"
                  onClick={() => onSelect(node.slug)}
                  aria-current={current.slug === node.slug ? 'page' : undefined}
                  tabIndex={!expanded && index >= visibleCount ? -1 : undefined}
                  aria-hidden={!expanded && index >= visibleCount ? true : undefined}
                  className={cn(
                    'min-h-11 max-w-full rounded-xl px-3.5 py-1.5 text-xs sm:text-sm',
                    current.slug === node.slug && 'bg-accent font-semibold text-primary',
                  )}
                  title={node.name}
                >
                  <span className="truncate">{node.name}</span>
                </FrontButton>
              </li>
            ))}
          </ul>
          {overflow ? (
            <FrontButton
              aria-expanded={expanded}
              aria-controls={`children-${root.id}`}
              onClick={() => setExpanded((value) => !value)}
              className="min-h-9 px-3 py-1.5 text-xs text-primary sm:text-sm"
            >
              {expanded ? '收起' : '更多分类'}
              {expanded ? (
                <ChevronUp aria-hidden="true" className="size-4" />
              ) : (
                <ChevronDown aria-hidden="true" className="size-4" />
              )}
            </FrontButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
