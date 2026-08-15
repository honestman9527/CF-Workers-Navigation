/**
 * Popup 分类选择器 —— 对齐 Web 端 CategoryPicker 体验：
 * 可展开树 + 路径搜索 + 完整路径展示 + 层级标记。
 * 因 popup 视口受限，面板用 absolute 而非 portal。
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown as CaretDown,
  ChevronRight as CaretRight,
  Folder,
  Search as MagnifyingGlass,
  X,
} from "lucide-react";
import type { CategoryNode } from "@ext/shared/api/types";

type FlatMatch = {
  id: number;
  name: string;
  path: string;
  level: number;
  icon: string | null;
  hasChildren: boolean;
};

function findAncestorPath(tree: CategoryNode[], id: number): CategoryNode[] {
  const walk = (nodes: CategoryNode[], trail: CategoryNode[]): CategoryNode[] | null => {
    for (const node of nodes) {
      if (node.id === id) return trail;
      const found = walk(node.children, [...trail, node]);
      if (found) return found;
    }
    return null;
  };
  return walk(tree, []) ?? [];
}

function findCategoryById(tree: CategoryNode[], id: number): CategoryNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const nested = findCategoryById(node.children, id);
    if (nested) return nested;
  }
  return null;
}

function flattenMatches(nodes: CategoryNode[], ancestors: string[] = [], level = 0): FlatMatch[] {
  return nodes.flatMap((node) => {
    const pathParts = [...ancestors, node.name];
    const self: FlatMatch = {
      id: node.id,
      name: node.name,
      path: pathParts.join(" / "),
      level,
      icon: node.icon,
      hasChildren: node.children.length > 0,
    };
    return [self, ...flattenMatches(node.children, pathParts, level + 1)];
  });
}

function defaultExpanded(tree: CategoryNode[], selectedId: number | null): Set<number> {
  const open = new Set<number>();
  if (selectedId === null) return open;
  for (const ancestor of findAncestorPath(tree, selectedId)) {
    open.add(ancestor.id);
  }
  return open;
}

function LevelBadge({ level }: { level: number }) {
  return (
    <span
      className="shrink-0 rounded px-1 py-px text-[10px] font-medium tabular-nums text-[var(--text-secondary)]"
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
              className={`group flex items-center gap-0.5 rounded-md ${
                active
                  ? "bg-[rgb(var(--accent)_/_0.1)] text-[rgb(var(--accent))]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
              }`}
              style={{ paddingLeft: `${depth * 10 + 2}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="flex h-7 w-5 shrink-0 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  aria-label={isOpen ? "收起" : "展开"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(node.id);
                  }}
                >
                  {isOpen ? (
                    <CaretDown size={11} />
                  ) : (
                    <CaretRight size={11} />
                  )}
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}

              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 text-left"
              >
                {node.icon ? (
                  <span className="shrink-0 text-xs leading-none">{node.icon}</span>
                ) : (
                  <Folder
                    size={13}
                    className={active ? "text-[rgb(var(--accent))]" : "text-[var(--text-secondary)]"}
                  />
                )}
                <span className={`min-w-0 truncate text-[13px] ${active ? "font-medium" : ""}`}>
                  {node.name}
                </span>
                <LevelBadge level={depth} />
                {active ? <Check size={13} className="ml-auto shrink-0" /> : null}
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
  placeholder = "选择分类",
  id,
  disabled = false,
}: {
  categories: CategoryNode[];
  value: number | null;
  onChange: (id: number) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(() => defaultExpanded(categories, value));

  const pathLookup = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of flattenMatches(categories)) {
      map.set(item.id, item.path);
    }
    return map;
  }, [categories]);

  const selectedLabel = useMemo(() => {
    if (value === null) return "";
    return pathLookup.get(value) ?? findCategoryById(categories, value)?.name ?? "";
  }, [value, pathLookup, categories]);

  const selectedLevel = useMemo(() => {
    if (value === null) return null;
    return findAncestorPath(categories, value).length;
  }, [value, categories]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = flattenMatches(categories);
    if (!needle) return all;
    return all.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle)
    );
  }, [categories, query]);

  useEffect(() => {
    if (!open) return;
    setExpanded(defaultExpanded(categories, value));
    setQuery("");
    const timer = window.setTimeout(() => searchRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
    // 仅在打开时重置展开与搜索
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function toggleExpand(id: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pick(id: number) {
    onChange(id);
    setOpen(false);
  }

  const isSearching = query.trim().length > 0;
  const empty = categories.length === 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled || empty}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="input flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Folder size={14} className="shrink-0 text-[var(--text-secondary)]" />
        <span className="min-w-0 flex-1 truncate">
          {selectedLabel ? (
            <span className="text-[var(--text-primary)]">{selectedLabel}</span>
          ) : (
            <span className="text-[var(--text-secondary)]">{empty ? "暂无分类" : placeholder}</span>
          )}
        </span>
        {selectedLevel !== null && value !== null ? <LevelBadge level={selectedLevel} /> : null}
        <CaretDown
          size={13}
          className={`shrink-0 text-[var(--text-secondary)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 flex max-h-[240px] flex-col overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900 shadow-xl"
        >
          <div className="shrink-0 border-b border-zinc-800 p-2">
            <label className="flex items-center gap-2 rounded-md border border-zinc-700/80 bg-zinc-950/60 px-2.5 py-1.5">
              <MagnifyingGlass size={13} className="shrink-0 text-[var(--text-secondary)]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full min-w-0 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-zinc-600"
                placeholder="搜索名称或路径"
                aria-label="搜索分类"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  aria-label="清除"
                >
                  <X size={11} />
                </button>
              ) : null}
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
            {isSearching ? (
              matches.length === 0 ? (
                <p className="px-2 py-5 text-center text-xs text-[var(--text-secondary)]">没有匹配的分类</p>
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
                      className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left ${
                        active
                          ? "bg-[rgb(var(--accent)_/_0.1)] text-[rgb(var(--accent))]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {item.icon ? (
                        <span className="mt-0.5 shrink-0 text-xs leading-none">{item.icon}</span>
                      ) : (
                        <Folder
                          size={13}
                          className={`mt-0.5 shrink-0 ${active ? "text-[rgb(var(--accent))]" : "text-[var(--text-secondary)]"}`}
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] ${active ? "font-medium" : ""}`}>
                          {item.name}
                        </span>
                        {item.level > 0 ? (
                          <span className="mt-0.5 block truncate text-[11px] text-[var(--text-secondary)]">
                            {item.path}
                          </span>
                        ) : null}
                      </span>
                      <LevelBadge level={item.level} />
                      {active ? <Check size={13} className="mt-0.5 shrink-0" /> : null}
                    </button>
                  );
                })
              )
            ) : categories.length === 0 ? (
              <p className="px-2 py-5 text-center text-xs text-[var(--text-secondary)]">暂无分类</p>
            ) : (
              <TreeRows
                nodes={categories}
                depth={0}
                selectedId={value}
                expanded={expanded}
                onToggle={toggleExpand}
                onSelect={pick}
              />
            )}
          </div>

          <div className="shrink-0 border-t border-zinc-800 px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)]">
            {isSearching
              ? `${matches.length} 个匹配 · 路径帮助定位层级`
              : "展开查看下级 · L1 / L2 表示层级"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
