import type { Category } from '@shared/api/types';

import { Check, ChevronDown, ChevronUp, Folder, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ApiError, api } from '@nav/api/client';
import { DialogPanel } from '@nav/components/DialogPanel';

import { CATEGORY_ICON_KEYS, categoryIcon } from './icons';
import { buildCategoryTree, type CategoryNode } from './tree';

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

export function CategoryManager({
  open,
  onClose,
  categories,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onChanged: () => Promise<void>;
}) {
  const tree = buildCategoryTree(categories);
  const [create, setCreate] = useState<CreateTarget | null>(null);
  const [createName, setCreateName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '操作失败，请重试');
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
    await run(() => api.createCategory('', { name, parentId }));
  }

  async function commitRename() {
    if (editing === null) return;
    const name = editing.name.trim();
    const current = categories.find((item) => item.id === editing.id);
    setEditing(null);
    if (!name || !current || name === current.name) return;
    await run(() => api.updateCategory('', editing.id, { name }));
  }

  async function setIcon(category: Category, icon: string) {
    await run(() => api.updateCategory('', category.id, { icon }));
  }

  async function move(category: Category, direction: -1 | 1) {
    const ids = siblingIds(categories, category);
    const index = ids.indexOf(category.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    await run(() => api.reorderCategories('', next));
  }

  async function remove(target: Category) {
    setConfirmDelete(null);
    await run(() => api.deleteCategory('', target.id));
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
    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60"
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
          </span>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
    <DialogPanel
      open={open}
      onClose={onClose}
      size="xl"
      labelledBy="category-manager-title"
      title="分类管理"
    >
      <div className="flex flex-col gap-1.5 pr-6">
        <h2 id="category-manager-title" className="font-display text-xl font-semibold">
          分类管理
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          分类是书签的粗粒度归属，可嵌套。删除分类后子分类上移一级，内含书签变为未分类。
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button size="sm" disabled={busy} onClick={() => startCreate('root')}>
          <Plus />
          新建分类
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="mt-3 grid gap-1 rounded-xl border border-border/70 bg-card p-3">
        {create?.parentId === 'root' ? createRow('root', 0) : null}
        {tree.length > 0 ? (
          <div className="grid gap-0.5">{tree.map((node) => renderNode(node, 0))}</div>
        ) : create === null ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            还没有分类，先新建一个吧
          </p>
        ) : null}
      </div>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除分类「{confirmDelete?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              其子分类会上移一级，内含书签将变为未分类，此操作不会删除书签。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (confirmDelete) void remove(confirmDelete);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogPanel>
  );
}
