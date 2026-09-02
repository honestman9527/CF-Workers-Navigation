import type { Category } from '@shared/api/types';

import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Folder,
  FolderInput,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { ConfirmDialog } from '@nav/components/ConfirmDialog';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { useApiData } from '@nav/hooks/useApiData';

import { CATEGORY_ICON_KEYS, categoryIcon } from '../categories/icons';
import {
  buildCategoryTree,
  descendantTotals,
  flattenCategoryTree,
  siblingIds,
  subtreeIds,
  type CategoryNode,
} from '../categories/tree';
import { useAdminRun } from './shared';

type CreateTarget = { parentId: number | 'root' };

export function CategoriesTab() {
  const auth = useAuthContext();
  const [create, setCreate] = useState<CreateTarget | null>(null);
  const [createName, setCreateName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  // 折叠集合：默认全展开，加入的 id 表示收起（反向维护，保持初次加载与旧观感一致）。
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const loadCategories = useCallback(
    (signal: AbortSignal) => api.getCategories(undefined, signal),
    [],
  );
  const {
    data: categories,
    loading,
    error: loadError,
    refresh,
  } = useApiData(loadCategories, {
    onUnauthorized: () => void auth.logout(),
  });
  const { busy, error: runError, run } = useAdminRun();

  const error = runError ?? loadError;

  const tree = useMemo(() => buildCategoryTree(categories ?? []), [categories]);
  const totals = useMemo(() => descendantTotals(categories ?? []), [categories]);

  function startCreate(parentId: number | 'root') {
    setCreate({ parentId });
    setCreateName('');
  }

  function toggleCollapse(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function commitCreate() {
    if (create === null) return;
    const name = createName.trim();
    setCreate(null);
    setCreateName('');
    if (!name) return;
    const parentId = create.parentId === 'root' ? null : create.parentId;
    await run(() => api.createCategory('', { name, parentId }), { message: '分类已创建', refresh });
  }

  async function commitRename() {
    if (editing === null) return;
    const name = editing.name.trim();
    const current = (categories ?? []).find((item) => item.id === editing.id);
    setEditing(null);
    if (!name || !current || name === current.name) return;
    await run(() => api.updateCategory('', editing.id, { name }), {
      message: '分类已重命名',
      refresh,
    });
  }

  async function setIcon(category: Category, icon: string) {
    await run(() => api.updateCategory('', category.id, { icon }), {
      message: '图标已更新',
      refresh,
    });
  }

  async function move(category: Category, direction: -1 | 1) {
    const ids = siblingIds(categories ?? [], category);
    const index = ids.indexOf(category.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    await run(() => api.reorderCategories('', next), { message: '排序已更新', refresh });
  }

  async function moveTo(category: Category, parentId: number | null) {
    if (category.parentId === parentId) return;
    await run(() => api.updateCategory('', category.id, { parentId }), {
      message: '分类已移动',
      refresh,
    });
  }

  async function remove(target: Category) {
    setConfirmDelete(null);
    await run(() => api.deleteCategory('', target.id), { message: '分类已删除', refresh });
  }

  const confirmDeleteMeta = useMemo(() => {
    if (!confirmDelete) return null;
    const ids = subtreeIds(categories ?? [], confirmDelete.id);
    const children = ids.length - 1;
    const bookmarks = totals.get(confirmDelete.id) ?? confirmDelete.bookmarkCount;
    return { children, bookmarks };
  }, [categories, confirmDelete, totals]);

  const flat = useMemo(() => flattenCategoryTree(tree), [tree]);

  function moveTargets(node: Category): Array<{ id: number | null; label: string }> {
    const exclude = new Set(subtreeIds(categories ?? [], node.id));
    return [
      { id: null, label: '不归属（根目录）' },
      ...flat
        .filter((item) => !exclude.has(item.id))
        .map((item) => ({
          id: item.id,
          label: `${'　'.repeat(Math.max(item.depth, 0))}${item.name}`,
        })),
    ];
  }

  const createRow = (parentId: number | 'root', depth: number) => (
    <div
      key="create"
      className={cn(
        'flex items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-2 transition-all',
        depth > 0 &&
          'relative ml-6 before:absolute before:top-1/2 before:-left-3.5 before:h-px before:w-3 before:bg-border/80',
      )}
    >
      <FolderPlus className="size-4 shrink-0 text-primary" />
      <Input
        autoFocus
        value={createName}
        onChange={(event) => setCreateName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void commitCreate();
          } else if (event.key === 'Escape') {
            setCreate(null);
            setCreateName('');
          }
        }}
        placeholder={parentId === 'root' ? '新一级分类名称' : '子分类名称'}
        className="h-8 bg-card text-xs"
        aria-label="分类名称"
      />
      <Button
        variant="default"
        size="xs"
        disabled={busy || !createName.trim()}
        onClick={() => void commitCreate()}
        aria-label="确认创建"
      >
        <Check className="size-3.5" />
        创建
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => {
          setCreate(null);
          setCreateName('');
        }}
        aria-label="取消"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );

  const renderNode = (node: CategoryNode, depth: number) => {
    const Icon = categoryIcon(node.icon);
    const isEditing = editing?.id === node.id;
    const totalCount = totals.get(node.id) ?? node.bookmarkCount;
    const isRoot = depth === 0;
    const isCollapsed = collapsed.has(node.id);
    const showChildren = (node.children.length > 0 && !isCollapsed) || create?.parentId === node.id;

    const actions = (
      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 text-muted-foreground hover:text-foreground"
          disabled={busy}
          onClick={() => startCreate(node.id)}
          aria-label={`在 ${node.name} 下新建子分类`}
          title="新建子分类"
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 text-muted-foreground hover:text-foreground"
          disabled={busy}
          onClick={() => move(node, -1)}
          aria-label="上移"
          title="上移"
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 text-muted-foreground hover:text-foreground"
          disabled={busy}
          onClick={() => move(node, 1)}
          aria-label="下移"
          title="下移"
        >
          <ChevronDown className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 text-muted-foreground hover:text-foreground"
          disabled={busy}
          onClick={() => setEditing({ id: node.id, name: node.name })}
          aria-label="重命名"
          title="重命名"
        >
          <Pencil className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-6 text-muted-foreground hover:text-foreground"
                disabled={busy}
                aria-label={`移动 ${node.name}`}
                title="调整层级 / 移动到…"
              />
            }
          >
            <FolderInput className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
            <DropdownMenuGroup>
              <DropdownMenuLabel>移动到父级分类</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {moveTargets(node).map((target) => (
              <DropdownMenuItem
                key={target.id ?? 'root'}
                onClick={() => void moveTo(node, target.id)}
              >
                <span className="truncate">{target.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={() => setConfirmDelete(node)}
          aria-label="删除"
          title="删除分类"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    );

    return (
      <div key={node.id} className="group/node relative">
        {/* 节点行 */}
        <div
          className={cn(
            'group flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors',
            isRoot
              ? 'border border-border/70 bg-card shadow-xs hover:border-primary/40'
              : 'hover:bg-muted/60',
          )}
        >
          {/* 分级折叠箭头（叶节点占位保持对齐） */}
          {node.children.length > 0 ? (
            <button
              type="button"
              aria-label={isCollapsed ? '展开分类' : '收起分类'}
              aria-expanded={!isCollapsed}
              onClick={() => toggleCollapse(node.id)}
              className="grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <ChevronRight
                className={cn(
                  'size-3.5 transition-transform duration-150',
                  !isCollapsed && 'rotate-90',
                )}
              />
            </button>
          ) : (
            <span className="grid size-6 shrink-0 place-items-center" aria-hidden />
          )}

          {/* 图标选择触发器 */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  disabled={busy}
                  aria-label="选择图标"
                  className={cn(
                    'grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg border transition',
                    isRoot
                      ? 'border-primary/20 bg-primary/10 text-primary'
                      : 'border-border/70 bg-muted text-muted-foreground hover:text-primary',
                  )}
                />
              }
            >
              <Icon className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>选择分类图标</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <div className="grid grid-cols-5 gap-1 p-1.5">
                {CATEGORY_ICON_KEYS.map((key) => {
                  const OptionIcon = categoryIcon(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={key}
                      onClick={() => void setIcon(node, key)}
                      className={cn(
                        'grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground',
                        key === node.icon && 'bg-primary/10 text-primary',
                      )}
                    >
                      <OptionIcon className="size-4" />
                    </button>
                  );
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 分类名称 */}
          {isEditing ? (
            <Input
              autoFocus
              value={editing.name}
              onChange={(event) => setEditing({ id: editing.id, name: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void commitRename();
                } else if (event.key === 'Escape') {
                  setEditing(null);
                }
              }}
              className="h-7 min-w-0 flex-1 text-xs"
              aria-label="重命名分类"
            />
          ) : (
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span
                className={cn(
                  'truncate',
                  isRoot ? 'text-xs font-semibold text-foreground' : 'text-xs text-foreground/90',
                )}
              >
                {node.name}
              </span>
              <span className="shrink-0 rounded bg-muted px-1 font-mono text-[9px] leading-4 text-muted-foreground/80">
                LV{depth + 1}
              </span>
              <span className="truncate font-mono text-[10px] text-muted-foreground/60">
                /{node.slug}
              </span>
            </div>
          )}

          {/* 书签统计徽章 */}
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">{node.bookmarkCount}</span>
            <span className="text-muted-foreground/50">/</span>
            <span>{totalCount}</span>
          </span>

          {/* 操作按钮组 */}
          {actions}
        </div>

        {/* 子分类容器（带树形导轨连线）；折叠时收起，新建子分类时强制展开 */}
        {showChildren ? (
          <div className="relative mt-1 ml-5 space-y-1 border-l-2 border-border/60 pl-3.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
            {create?.parentId === node.id ? createRow(node.id, depth + 1) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">分类管理</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          分类是书签的树形归属。删除分类后子分类自动上移一级，内含书签转为未分类。书签数统计为「直属
          / 含子类总数」。
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button size="sm" disabled={busy} onClick={() => startCreate('root')}>
          <Plus className="size-4" />
          新建一级分类
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      {loading ? (
        <div className="h-44 animate-pulse rounded-xl bg-muted/60" />
      ) : (
        <div className="space-y-3">
          {create?.parentId === 'root' ? createRow('root', 0) : null}
          {tree.length > 0 ? (
            <div className="space-y-2.5">{tree.map((node) => renderNode(node, 0))}</div>
          ) : create === null ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <Folder className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">还没有分类</p>
              <p className="mt-1 text-xs text-muted-foreground">
                点击上方「新建一级分类」开启整理。
              </p>
            </div>
          ) : null}
        </div>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        小提示：点击图标可自定义图标；点击右侧文件夹图标「调整层级」可自由把分类移入其他父分类下，或移动到根目录。
      </p>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmDelete(null);
        }}
        title={confirmDelete ? `删除分类「${confirmDelete.name}」？` : ''}
        description={
          confirmDeleteMeta
            ? `将 ${confirmDeleteMeta.children} 个子分类上移一级，${confirmDeleteMeta.bookmarks} 个书签变为未分类。此操作不会删除书签，且不可直接撤销。`
            : undefined
        }
        confirmLabel="删除"
        busy={busy}
        onConfirm={() => {
          if (confirmDelete) void remove(confirmDelete);
        }}
      />
    </div>
  );
}
