import type { CategoryNode } from '@nav/features/categories/tree';

import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
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
  const current = path[path.length - 1];
  const list = useRef<HTMLUListElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [visibleCount, setVisibleCount] = useState(current.children.length);
  const childrenKey = JSON.stringify(current.children.map((child) => [child.slug, child.name]));
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
    <div className="mb-5 space-y-2 px-3">
      <nav aria-label={`${path[0].name}分类路径`}>
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
          {path.map((node, index) => (
            <li key={node.id} className="flex min-w-0 items-center gap-1">
              {index ? (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              ) : null}
              {index === path.length - 1 ? (
                <span
                  aria-current="page"
                  tabIndex={-1}
                  className="max-w-64 py-3 break-words text-foreground"
                >
                  {node.name}
                </span>
              ) : (
                <FrontButton
                  onClick={() => onSelect(node.slug)}
                  className="max-w-64 whitespace-normal text-primary"
                >
                  {node.name}
                </FrontButton>
              )}
            </li>
          ))}
        </ol>
      </nav>
      {current.children.length ? (
        <>
          <ul
            ref={list}
            id={`children-${current.id}`}
            aria-label={`${current.name}子分类`}
            className={cn('relative flex flex-wrap gap-2', !expanded && 'max-h-24 overflow-hidden')}
          >
            {current.children.map((node, index) => (
              <li
                key={node.id}
                className="flex max-w-full"
                aria-hidden={!expanded && index >= visibleCount ? true : undefined}
              >
                <FrontButton
                  onClick={() => onSelect(node.slug)}
                  tabIndex={!expanded && index >= visibleCount ? -1 : undefined}
                  aria-hidden={!expanded && index >= visibleCount ? true : undefined}
                  className="h-11 max-w-full border border-border/60 bg-card px-4 text-sm"
                  title={node.name}
                >
                  <span className="truncate">{node.name}</span>
                  {node.children.length ? (
                    <ChevronRight
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                  ) : null}
                </FrontButton>
              </li>
            ))}
          </ul>
          {overflow ? (
            <FrontButton
              aria-expanded={expanded}
              aria-controls={`children-${current.id}`}
              onClick={() => setExpanded((value) => !value)}
              className="text-sm text-primary"
            >
              {expanded ? '收起' : '更多分类'}
              {expanded ? (
                <ChevronUp aria-hidden="true" className="size-4" />
              ) : (
                <ChevronDown aria-hidden="true" className="size-4" />
              )}
            </FrontButton>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
