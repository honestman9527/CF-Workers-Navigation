/**
 * Popup 分类选择器：按钮 + 内联展开的可折叠树（LV 层级徽标）。
 * 纯本地实现，不引用 Web 内部源码；样式走 popup 的 Tailwind + CSS 变量。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Code2,
  Folder,
  FolderOpen,
  Globe,
  Heart,
  Home,
  Palette,
  Star,
} from "lucide-react";
import type { Category } from "@shared/api/types";

const ICON_MAP: Record<string, typeof Folder> = {
  folder: Folder,
  "folder-open": FolderOpen,
  star: Star,
  heart: Heart,
  book: BookOpen,
  code: Code2,
  palette: Palette,
  briefcase: Briefcase,
  home: Home,
  globe: Globe,
};

function categoryIcon(key: string | null | undefined): typeof Folder {
  return (key ? ICON_MAP[key] : undefined) ?? Folder;
}

type CategoryNode = Category & { children: CategoryNode[] };

function buildTree(categories: Category[]): CategoryNode[] {
  const nodes = new Map<number, CategoryNode>();
  for (const category of categories) {
    nodes.set(category.id, { ...category, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId !== null ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: CategoryNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hans-CN"));
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}

function TreeNode({
  node,
  depth,
  expanded,
  selectedId,
  onSelect,
  onToggle,
}: {
  node: CategoryNode;
  depth: number;
  expanded: Set<number>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const Icon = categoryIcon(node.icon);

  return (
    <div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] ${
            isSelected
              ? "bg-[color-mix(in_srgb,var(--accent-hex)_12%,transparent)] font-medium text-[var(--accent-hex)]"
              : "text-[var(--text-primary)]"
          }`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="shrink-0 rounded bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] px-1 font-mono text-[9px] leading-4 text-[var(--text-tertiary)]">
            LV{depth + 1}
          </span>
        </button>
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? "收起分类" : "展开分类"}
            aria-expanded={isExpanded}
            onClick={() => onToggle(node.id)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : null}
      </div>
      {hasChildren && isExpanded ? (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-[var(--border-color)] pl-2">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CategorySelect({
  categories,
  value,
  onChange,
  loading = false,
}: {
  categories: Category[];
  value: number | null;
  onChange: (id: number | null) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const selected = useMemo(
    () => (value !== null ? categories.find((item) => item.id === value) : undefined),
    [categories, value],
  );

  // 点击外部或按 Escape 收起面板。
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const SelectedIcon = selected ? categoryIcon(selected.icon) : Folder;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="input flex w-full items-center gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <SelectedIcon className="h-4 w-4 shrink-0 text-[var(--accent-hex)]" />
        <span className="min-w-0 flex-1 truncate">
          {loading ? "加载分类中…" : selected ? selected.name : "未分类"}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="animate-fade-in absolute top-full left-0 z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--card-bg)] p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] ${
              value === null ? "bg-[color-mix(in_srgb,var(--accent-hex)_12%,transparent)] font-medium text-[var(--accent-hex)]" : "text-[var(--text-primary)]"
            }`}
          >
            <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
            <span className="min-w-0 flex-1 truncate">未分类</span>
          </button>
          {tree.length > 0 ? (
            <div className="mt-0.5 border-t border-[var(--border-color)] pt-0.5">
              {tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  selectedId={value}
                  onSelect={(id) => {
                    onChange(id);
                    setOpen(false);
                  }}
                  onToggle={toggle}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
