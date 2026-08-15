import type { LucideIcon } from 'lucide-react';

import type { CategoryNode } from '@nav/api/types';

import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Code,
  Folder,
  GraduationCap,
  MoreVertical,
  Newspaper,
  Paintbrush,
  Pencil,
  PlayCircle,
  ShoppingBag,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { memo } from 'react';

import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, LucideIcon> = {
  docs: BookOpen,
  doc: BookOpen,
  tools: Wrench,
  tool: Wrench,
  code: Code,
  dev: Code,
  video: PlayCircle,
  media: PlayCircle,
  design: Paintbrush,
  art: Paintbrush,
  news: Newspaper,
  read: Newspaper,
  social: Users,
  community: Users,
  shop: ShoppingBag,
  store: ShoppingBag,
  learn: GraduationCap,
  study: GraduationCap,
};

function categoryIcon(icon: string | null): LucideIcon {
  if (!icon) {
    return Folder;
  }
  return ICON_MAP[icon.toLowerCase()] ?? Folder;
}

type CategoryItemProps = {
  category: CategoryNode;
  selectedCategoryId: number | null;
  depth: number;
  countMap: Map<number, number>;
  collapsed: Set<number>;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onEdit: (category: CategoryNode) => void;
  onDelete: (category: CategoryNode) => void;
};

const CategoryItem = memo(function CategoryItem({
  category,
  selectedCategoryId,
  depth,
  countMap,
  collapsed,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
}: CategoryItemProps) {
  const active = selectedCategoryId === category.id;
  const Icon = categoryIcon(category.icon);
  const hasChildren = category.children.length > 0;
  const count = countMap.get(category.id) ?? 0;
  const isCollapsed = collapsed.has(category.id);

  return (
    <div>
      <div
        className={cn(
          'group relative flex w-full items-center gap-0.5 rounded-md pr-1 text-left transition-colors',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
      >
        {active ? (
          <span className="absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
        ) : null}

        {hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(category.id);
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={isCollapsed ? '展开' : '收起'}
          >
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        ) : (
          <span className="w-8 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelect(category.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left outline-none"
        >
          <Icon
            size={15}
            className={active ? 'fill-current text-primary' : 'text-muted-foreground'}
          />
          <span className={cn('min-w-0 truncate text-[13px]', active && 'font-medium')}>
            {category.name}
          </span>
        </button>

        <span className="flex shrink-0 items-center gap-0.5">
          {count > 0 ? (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] tabular-nums',
                active ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
              )}
            >
              {count}
            </span>
          ) : null}
          <span className="flex items-center opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(category);
              }}
              aria-label="编辑文件夹"
              title="编辑文件夹"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(category);
              }}
              aria-label="删除文件夹"
              title="删除文件夹"
            >
              <Trash2 size={14} />
            </button>
          </span>
        </span>
      </div>

      {hasChildren && !isCollapsed
        ? category.children.map((child) => (
            <CategoryItem
              key={child.id}
              category={child}
              selectedCategoryId={selectedCategoryId}
              depth={depth + 1}
              countMap={countMap}
              collapsed={collapsed}
              onSelect={onSelect}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        : null}
    </div>
  );
});

export function CategoryTree(props: {
  categories: CategoryNode[];
  selectedCategoryId: number | null;
  collapsed: Set<number>;
  countMap: Map<number, number>;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onEdit: (category: CategoryNode) => void;
  onDelete: (category: CategoryNode) => void;
}) {
  if (props.categories.length === 0) {
    return (
      <p className="flex items-center gap-2 px-2 py-8 text-sm text-muted-foreground">
        <MoreVertical size={16} />
        还没有文件夹
      </p>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5" aria-label="文件夹">
      {props.categories.map((category) => (
        <CategoryItem
          key={category.id}
          category={category}
          selectedCategoryId={props.selectedCategoryId}
          depth={0}
          countMap={props.countMap}
          collapsed={props.collapsed}
          onSelect={props.onSelect}
          onToggle={props.onToggle}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
        />
      ))}
    </nav>
  );
}
