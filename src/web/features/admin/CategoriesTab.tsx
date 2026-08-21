import type { Category } from '@shared/api/types';

import {
  Check,
  ChevronDown,
  ChevronUp,
  Folder,
  FolderInput,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
import { ApiError, api } from '@nav/api/client';
import { ConfirmDialog } from '@nav/components/ConfirmDialog';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';

import { CATEGORY_ICON_KEYS, categoryIcon } from '../categories/icons';
import { buildCategoryTree, flattenCategoryTree, type CategoryNode } from '../categories/tree';

type CreateTarget = { parentId: number | 'root' };

function compareCategory(a: Category, b: Category): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN');
}

function siblingIds(categories: Category[], node: Category): number[] {
  return categories
    .filter((item) => (item.parentId ?? null) === (node.parentId ?? null))
    .sort(compareCategory)
    .map((item) => item.id);
}

/** 每个分类的「含子类书签总数」映射（直属 + 所有后代的直属计数）。 */
function descendantTotals(categories: Category[]): Map<number, number> {
  const byParent = new Map<number | null, Category[]>();
  for (const category of categories) {
    const key = category.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(category);
    else byParent.set(key, [category]);
  }
  const totals = new Map<number, number>();
  function sum(id: number): number {
    const cached = totals.get(id);
    if (cached !== undefined) return cached;
    const node = categories.find((item) => item.id === id);
    let result = node?.bookmarkCount ?? 0;
    for (const child of byParent.get(id) ?? []) result += sum(child.id);
    totals.set(id, result);
    return result;
  }
  for (const category of categories) sum(category.id);
  return totals;
}

/** 目标分类下所有后代 id（含自身），用于「移动到…」排除集与删除影响统计。 */
function subtreeIds(categories: Category[], rootId: number): number[] {
  const byParent = new Map<number | null, Category[]>();
  for (const category of categories) {
    const key = category.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(category);
    else byParent.set(key, [category]);
  }
  const ids: number[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    ids.push(id);
    for (const child of byParent.get(id) ?? []) stack.push(child.id);
  }
  return ids;
}

export function CategoriesTab() {
  const auth = useAuthContext();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [create, setCreate] = useState<CreateTarget | null>(null);
  const [createName, setCreateName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const totals = useMemo(() => descendantTotals(categories), [categories]);

  async function refresh() {
    const next = await api.getCategories();
    setCategories(next);
  }

  useEffect(() => {
    let alive = true;
    api
      .getCategories()
      .then((next) => {
        if (alive) setCategories(next);
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) {
          void auth.logout();
        } else if (alive) {
          setError(caught instanceof ApiError ? caught.message : '分类加载失败');
        }
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function run(action: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
      if (message) pushToast(message, 'success');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        void auth.logout();
      } else {
        setError(caught instanceof ApiError ? caught.message : '操作失败，请重试');
      }
    } finally {
      setBusy(false);
    }
  }

  function startCreate(parentId: number | 'root') {
    setCreate({ parentId });
    setCreateName('');
  }

  async function commitCreate() {
    if (create === null) return;
    const name = createName.trim();
    setCreate(null);
    setCreateName('');
    if (!name) return;
    const parentId = create.parentId === 'root' ? null : create.parentId;
    await run(() => api.createCategory('', { name, parentId }), '分类已创建');
  }

  async function commitRename() {
    if (editing === null) return;
    const name = editing.name.trim();
    const current = categories.find((item) => item.id === editing.id);
    setEditing(null);
    if (!name || !current || name === current.name) return;
    await run(() => api.updateCategory('', editing.id, { name }), '分类已重命名');
  }

  async function setIcon(category: Category, icon: string) {
    await run(() => api.updateCategory('', category.id, { icon }), '图标已更新');
  }

  async function move(category: Category, direction: -1 | 1) {
    const ids = siblingIds(categories, category);
    const index = ids.indexOf(category.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    await run(() => api.reorderCategories('', next), '排序已更新');
  }

  async function moveTo(category: Category, parentId: number | null) {
    if (category.parentId === parentId) return;
    await run(() => api.updateCategory('', category.id, { parentId }), '分类已移动');
  }

  async function remove(target: Category) {
    setConfirmDelete(null);
    await run(() => api.deleteCategory('', target.id), '分类已删除');
  }

  const confirmDeleteMeta = useMemo(() => {
    if (!confirmDelete) return null;
    const ids = subtreeIds(categories, confirmDelete.id);
    const children = ids.length - 1;
    const bookmarks = totals.get(confirmDelete.id) ?? confirmDelete.bookmarkCount;
    return { children, bookmarks };
  }, [categories, confirmDelete, totals]);

  const flat = useMemo(() => flattenCategoryTree(tree), [tree]);

  function moveTargets(node: Category): Array<{ id: number | null; label: string }> {
    const exclude = new Set(subtreeIds(categories, node.id));
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
      className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2"
      style={{ marginLeft: depth > 0 ? `${depth * 0.9}rem` : undefined }}
    >
      <Folder className="size-4 shrink-0 text-primary" />
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
        placeholder={parentId === 'root' ? '新分类名称' : '子分类名称'}
        className="h-8"
        aria-label="分类名称"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={busy || !createName.trim()}
        onClick={() => void commitCreate()}
        aria-label="确认创建"
      >
        <Check className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          setCreate(null);
          setCreateName('');
        }}
        aria-label="取消"
      >
        <X className="size-4" />
      </Button>
    </div>
  );

  const renderNode = (node: CategoryNode, depth: number) => {
    const Icon = categoryIcon(node.icon);
    const isEditing = editing?.id === node.id;
    const totalCount = totals.get(node.id) ?? node.bookmarkCount;
    const actions = (
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          disabled={busy}
          onClick={() => startCreate(node.id)}
          aria-label={`在 ${node.name} 下新建子分类`}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          disabled={busy}
          onClick={() => move(node, -1)}
          aria-label="上移"
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          disabled={busy}
          onClick={() => move(node, 1)}
          aria-label="下移"
        >
          <ChevronDown className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          disabled={busy}
          onClick={() => setEditing({ id: node.id, name: node.name })}
          aria-label="重命名"
        >
          <Pencil className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6"
                disabled={busy}
                aria-label={`移动 ${node.name}`}
              />
            }
          >
            <FolderInput className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
            <DropdownMenuGroup>
              <DropdownMenuLabel>移动到…</DropdownMenuLabel>
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
          size="icon-sm"
          className="size-6 text-destructive hover:text-destructive"
          disabled={busy}
          onClick={() => setConfirmDelete(node)}
          aria-label="删除"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    );
    return (
      <div key={node.id}>
        <div
          className="group flex flex-wrap items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60"
          style={{ marginLeft: depth > 0 ? `${depth * 0.9}rem` : undefined }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  aria-label="选择图标"
                  className="size-7"
                />
              }
            >
              <Icon className="size-4 text-primary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>图标</DropdownMenuLabel>
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
              className="h-8"
              aria-label="重命名分类"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm">{node.name}</span>
          )}
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
            {node.bookmarkCount}
            <span className="text-muted-foreground/60">/{totalCount}</span>
          </span>
          {actions}
        </div>
        {node.children.length > 0 ? (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
            {create?.parentId === node.id ? createRow(node.id, depth + 1) : null}
          </div>
        ) : create?.parentId === node.id ? (
          createRow(node.id, depth + 1)
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">分类管理</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          分类是书签的粗粒度归属，可嵌套。删除分类后子分类上移一级，内含书签变为未分类。书签数显示为「直属/含子类」。
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button size="sm" disabled={busy} onClick={() => startCreate('root')}>
          <Plus />
          新建分类
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      {!loaded ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : (
        <div className="grid gap-1 rounded-xl border border-border/70 bg-card p-3">
          {create?.parentId === 'root' ? createRow('root', 0) : null}
          {tree.length > 0 ? (
            <div className="grid gap-0.5">{tree.map((node) => renderNode(node, 0))}</div>
          ) : create === null ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              还没有分类，先新建一个吧
            </p>
          ) : null}
        </div>
      )}

      <p className="text-[11px] leading-5 text-muted-foreground">
        小技巧：先在上方「新建分类」，再把已有分类「移动到…」其下，即可搭建层级。
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
