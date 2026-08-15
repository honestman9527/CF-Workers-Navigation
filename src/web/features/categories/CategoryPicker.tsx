import type { CategoryNode } from '@nav/api/types';

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Check, ChevronDown, ChevronRight, Folder, Search, X } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { findAncestorPath, findCategoryById } from '@nav/utils/bookmarks';

type FlatMatch = {
  id: number;
  name: string;
  path: string;
  level: number;
};

function collectExcludedIds(tree: CategoryNode[], excludeId: number | undefined): Set<number> {
  const excluded = new Set<number>();
  if (excludeId === undefined) {
    return excluded;
  }

  const mark = (nodes: CategoryNode[]): boolean => {
    for (const node of nodes) {
      if (node.id === excludeId) {
        const walk = (current: CategoryNode) => {
          excluded.add(current.id);
          current.children.forEach(walk);
        };
        walk(node);
        return true;
      }
      if (mark(node.children)) {
        return true;
      }
    }
    return false;
  };

  mark(tree);
  return excluded;
}

function filterTree(nodes: CategoryNode[], excluded: Set<number>): CategoryNode[] {
  return nodes
    .filter((node) => !excluded.has(node.id))
    .map((node) => ({
      ...node,
      children: filterTree(node.children, excluded),
    }));
}

function flattenMatches(nodes: CategoryNode[], ancestors: string[] = [], level = 0): FlatMatch[] {
  return nodes.flatMap((node) => {
    const pathParts = [...ancestors, node.name];
    const self: FlatMatch = {
      id: node.id,
      name: node.name,
      path: pathParts.join(' / '),
      level,
    };
    return [self, ...flattenMatches(node.children, pathParts, level + 1)];
  });
}

function defaultExpanded(tree: CategoryNode[], selectedId: number | null): Set<number> {
  const open = new Set<number>();
  if (selectedId === null) {
    return open;
  }
  for (const ancestor of findAncestorPath(tree, selectedId)) {
    open.add(ancestor.id);
  }
  return open;
}

function LevelBadge({ level }: { level: number }) {
  return (
    <span
      className="shrink-0 rounded px-1 py-px text-[10px] font-medium text-muted-foreground tabular-nums"
      title={`第 ${level + 1} 级分类`}
    >
      L{level + 1}
    </span>
  );
}

function TreeRows({
  nodes,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
}: {
  nodes: CategoryNode[];
  depth: number;
  selectedId: number | null;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const active = selectedId === node.id;
        const hasChildren = node.children.length > 0;
        const isOpen = expanded.has(node.id);

        return (
          <div key={node.id}>
            <div
              className={cn(
                'group flex min-h-9 items-center gap-0.5 rounded-md',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                  aria-label={isOpen ? '收起' : '展开'}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(node.id);
                  }}
                >
                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : (
                <span className="w-8 shrink-0" />
              )}

              <button
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(node.id)}
                className="flex min-h-9 min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left"
              >
                <Folder
                  size={15}
                  className={
                    active ? 'shrink-0 fill-current text-primary' : 'shrink-0 text-muted-foreground'
                  }
                />
                <span
                  className={cn('min-w-0 flex-1 truncate text-[13px]', active && 'font-medium')}
                >
                  {node.name}
                </span>
                <LevelBadge level={depth} />
                {active ? <Check size={14} className="shrink-0" /> : null}
              </button>
            </div>

            {hasChildren && isOpen ? (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                selectedId={selectedId}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  allowNull = false,
  nullLabel = '顶层分类',
  excludeId,
  placeholder = '选择分类',
  id,
  disabled = false,
}: {
  categories: CategoryNode[];
  value: number | null;
  onChange: (id: number | null) => void;
  allowNull?: boolean;
  nullLabel?: string;
  excludeId?: number;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(() => defaultExpanded(categories, value));

  const excluded = useMemo(
    () => collectExcludedIds(categories, excludeId),
    [categories, excludeId],
  );
  const tree = useMemo(() => filterTree(categories, excluded), [categories, excluded]);
  const flattened = useMemo(() => flattenMatches(tree), [tree]);
  const pathLookup = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of flattened) {
      map.set(item.id, item.path);
    }
    return map;
  }, [flattened]);

  const selectedLabel = useMemo(() => {
    if (value === null) {
      return allowNull ? nullLabel : '';
    }
    return pathLookup.get(value) ?? findCategoryById(categories, value)?.name ?? '';
  }, [value, allowNull, nullLabel, pathLookup, categories]);

  const selectedLevel = useMemo(() => {
    if (value === null) {
      return allowNull ? 0 : null;
    }
    return findAncestorPath(categories, value).length;
  }, [value, allowNull, categories]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return flattened;
    }
    return flattened.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle),
    );
  }, [flattened, query]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setExpanded(defaultExpanded(tree, value));
      setQuery('');
    }
    setOpen(nextOpen);
  }

  function toggleExpand(categoryId: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  function pick(categoryId: number | null) {
    onChange(categoryId);
    setOpen(false);
  }

  const isSearching = query.trim().length > 0;
  const empty = tree.length === 0 && !allowNull;

  return (
    <PopoverPrimitive.Root data-slot="popover" modal open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger
        data-slot="popover-trigger"
        render={
          <button
            id={id}
            type="button"
            disabled={disabled || empty}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            className="flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-card px-3 py-1 text-left text-sm text-foreground shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
        }
      >
        <Folder size={15} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {selectedLabel ? (
            <span className="text-foreground">{selectedLabel}</span>
          ) : (
            <span className="text-muted-foreground">{empty ? '暂无分类' : placeholder}</span>
          )}
        </span>
        {selectedLevel !== null && value !== null ? <LevelBadge level={selectedLevel} /> : null}
        <ChevronDown
          size={14}
          className={cn('shrink-0 text-muted-foreground transition', open && 'rotate-180')}
        />
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          className="isolate z-50"
          align="start"
          sideOffset={4}
          collisionPadding={12}
        >
          <PopoverPrimitive.Popup
            id={listId}
            role="dialog"
            aria-label="选择分类"
            initialFocus={searchRef}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl outline-none"
            style={{
              width: 'var(--anchor-width)',
              maxHeight: 'min(20rem, var(--available-height))',
            }}
          >
            <div className="shrink-0 border-b border-border p-2">
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
                <Search size={14} className="shrink-0 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder="搜索分类名称或路径"
                  aria-label="搜索分类"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="清除搜索"
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </label>
            </div>

            <div
              role="listbox"
              aria-label="分类"
              className="min-h-0 flex-1 touch-pan-y [scrollbar-gutter:stable] overflow-y-auto overscroll-contain p-1.5 [-webkit-overflow-scrolling:touch]"
            >
              {allowNull && !isSearching ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={value === null}
                  onClick={() => pick(null)}
                  className={cn(
                    'mb-0.5 flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px]',
                    value === null
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{nullLabel}</span>
                  {value === null ? <Check size={14} /> : null}
                </button>
              ) : null}

              {isSearching ? (
                matches.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    没有匹配的分类
                  </p>
                ) : (
                  matches.map((item) => {
                    const active = value === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => pick(item.id)}
                        className={cn(
                          'flex min-h-10 w-full items-start gap-2 rounded-md px-2.5 py-2 text-left',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <Folder
                          size={14}
                          className={cn(
                            'mt-0.5 shrink-0',
                            active ? 'fill-current text-primary' : 'text-muted-foreground',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn('block truncate text-[13px]', active && 'font-medium')}
                          >
                            {item.name}
                          </span>
                          {item.level > 0 ? (
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {item.path}
                            </span>
                          ) : null}
                        </span>
                        <LevelBadge level={item.level} />
                        {active ? <Check size={14} className="mt-0.5 shrink-0" /> : null}
                      </button>
                    );
                  })
                )
              ) : tree.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {allowNull ? '暂无其他分类' : '暂无分类'}
                </p>
              ) : (
                <TreeRows
                  nodes={tree}
                  depth={0}
                  selectedId={value}
                  expanded={expanded}
                  onToggle={toggleExpand}
                  onSelect={pick}
                />
              )}
            </div>

            <div className="shrink-0 border-t border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
              {isSearching
                ? `${matches.length} 个匹配 · 完整路径帮助定位层级`
                : '展开查看下级 · L1 / L2 表示层级'}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
