import type { Tag } from '@shared/api/types';

import { Check, GitMerge, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { ConfirmDialog } from '@nav/components/ConfirmDialog';
import { DialogPanel } from '@nav/components/DialogPanel';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { useApiData } from '@nav/hooks/useApiData';

import { useAdminRun } from './shared';

export function TagsTab() {
  const auth = useAuthContext();
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [mergeFor, setMergeFor] = useState<Tag | null>(null);
  const [mergeTarget, setMergeTarget] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Tag | null>(null);

  const loadTags = useCallback((signal: AbortSignal) => api.getTags(undefined, signal), []);
  const {
    data: tags,
    loading,
    error: loadError,
    refresh,
  } = useApiData(loadTags, {
    onUnauthorized: () => void auth.logout(),
  });
  const { busy, error: runError, run } = useAdminRun();

  const error = runError ?? loadError;

  async function commitCreate() {
    const name = createName.trim();
    setCreating(false);
    setCreateName('');
    if (!name) return;
    await run(() => api.createTag('', name), { message: '标签已创建', refresh });
  }

  async function commitRename() {
    if (editing === null) return;
    const name = editing.name.trim();
    const current = (tags ?? []).find((item) => item.id === editing.id);
    setEditing(null);
    if (!name || !current || name === current.name) return;
    await run(() => api.updateTag('', editing.id, name), { message: '标签已重命名', refresh });
  }

  async function commitMerge() {
    if (mergeFor === null || mergeTarget === null) return;
    const source = mergeFor;
    setMergeFor(null);
    setMergeTarget(null);
    await run(() => api.mergeTag('', source.id, mergeTarget), {
      message: `已合并到目标标签`,
      refresh,
    });
  }

  async function remove(target: Tag) {
    setConfirmDelete(null);
    await run(() => api.deleteTag('', target.id), { message: '标签已删除', refresh });
  }

  const filtered = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    if (!query) return tags ?? [];
    return (tags ?? []).filter(
      (item) =>
        item.name.toLocaleLowerCase().includes(query) ||
        item.slug.toLocaleLowerCase().includes(query),
    );
  }, [filter, tags]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold">标签管理</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          标签是细粒度的书签标注。合并会把源标签的关联书签全部改指到目标标签，适合整理近义标签。
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 focus-within:border-primary/50">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="筛选标签"
            aria-label="筛选标签"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {filter ? (
            <button
              type="button"
              aria-label="清除筛选"
              onClick={() => setFilter('')}
              className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <Button size="sm" disabled={busy} onClick={() => setCreating(true)}>
          <Plus />
          新建标签
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="grid gap-1 rounded-lg border border-border bg-card p-3">
          {creating ? (
            <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2">
              <span className="font-mono text-sm text-primary">#</span>
              <Input
                autoFocus
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void commitCreate();
                  } else if (event.key === 'Escape') {
                    setCreating(false);
                    setCreateName('');
                  }
                }}
                placeholder="新标签名称"
                className="h-8"
                aria-label="新标签名称"
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
                  setCreating(false);
                  setCreateName('');
                }}
                aria-label="取消"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : null}

          {filtered.length > 0 ? (
            <div className="grid gap-0.5">
              {filtered.map((tag) => {
                const isEditing = editing?.id === tag.id;
                return (
                  <div
                    key={tag.id}
                    className="group flex flex-wrap items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60"
                  >
                    <span className="grid size-7 shrink-0 place-items-center text-sm text-primary">
                      #
                    </span>
                    {isEditing ? (
                      <Input
                        autoFocus
                        value={editing.name}
                        onChange={(event) =>
                          setEditing({ id: editing.id, name: event.target.value })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void commitRename();
                          } else if (event.key === 'Escape') {
                            setEditing(null);
                          }
                        }}
                        className="h-8"
                        aria-label="重命名标签"
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm">{tag.name}</span>
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                      /{tag.slug}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                      {tag.bookmarkCount}
                    </span>
                    <div className="flex shrink-0 flex-wrap items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-6"
                        disabled={busy}
                        onClick={() => setEditing({ id: tag.id, name: tag.name })}
                        aria-label="重命名"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-6"
                        disabled={busy}
                        onClick={() => {
                          setMergeFor(tag);
                          setMergeTarget(null);
                        }}
                        aria-label="合并标签"
                      >
                        <GitMerge className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-6 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => setConfirmDelete(tag)}
                        aria-label="删除"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {(tags ?? []).length === 0 ? '还没有标签，编辑书签时会自动创建' : '没有匹配的标签'}
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] leading-5 text-muted-foreground">
        提示：为书签添加标签时输入同名会自动复用，无需手动创建；这里主要用于重命名、合并与删除整理。
      </p>

      <DialogPanel
        open={mergeFor !== null}
        onClose={() => setMergeFor(null)}
        dismissible={!busy}
        size="md"
        labelledBy="merge-tag-title"
        title="合并标签"
      >
        <h2 id="merge-tag-title" className="font-display text-xl font-semibold">
          合并标签
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          把「<span className="font-medium text-primary">#{mergeFor?.name}</span>
          」合并到目标标签，其关联的 {mergeFor?.bookmarkCount ?? 0}{' '}
          个书签将改指目标。此操作不可撤销。
        </p>
        <div className="mt-4 grid max-h-64 gap-1 overflow-y-auto pr-1">
          {(tags ?? [])
            .filter((item) => item.id !== mergeFor?.id)
            .map((item) => {
              const selected = mergeTarget === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMergeTarget(item.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-left text-sm transition hover:border-primary/45',
                    selected && 'border-primary/60 bg-primary/5',
                  )}
                >
                  <span className="text-primary">#</span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {item.bookmarkCount}
                  </span>
                </button>
              );
            })}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => setMergeFor(null)}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={busy || mergeTarget === null}
            onClick={() => void commitMerge()}
          >
            {busy ? '合并中…' : '确认合并'}
          </Button>
        </div>
      </DialogPanel>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmDelete(null);
        }}
        title={confirmDelete ? `删除标签「#${confirmDelete.name}」？` : ''}
        description={
          confirmDelete
            ? `将从 ${confirmDelete.bookmarkCount} 个书签中移除该标签。此操作不可撤销。`
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
