import type { Bookmark, BookmarkInput, BookmarkView } from '@shared/api/types';

import { Globe, LayoutGrid, List, Plus, Search, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { BookmarkCard } from '@nav/features/bookmarks/BookmarkCard';
import { ConfirmStateDialog } from '@nav/features/bookmarks/ConfirmStateDialog';
import { useBookmarkMutations } from '@nav/features/bookmarks/useBookmarkMutations';
import { useBookmarkPage } from '@nav/features/bookmarks/useBookmarkPage';
import { buildCategoryTree, flattenCategoryTree } from '@nav/features/categories/tree';
import { useApiData } from '@nav/hooks/useApiData';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

const BookmarkForm = lazy(() =>
  import('@nav/features/bookmarks/BookmarkForm').then((module) => ({
    default: module.BookmarkForm,
  })),
);

const VIEWS: Array<{ id: BookmarkView; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '活动' },
  { id: 'archive', label: '归档' },
  { id: 'trash', label: '回收站' },
];

/**
 * 统一的网站（书签）管理：全状态浏览 + 搜索 + 分类/标签筛选 + 网格/列表 + 增删改归档。
 * 卡片与表单复用工作区组件，写操作经 useBookmarkMutations 统一包装。
 */
export function WebsitesTab() {
  const auth = useAuthContext();
  const handleUnauthorized = useCallback(() => void auth.logout(), [auth]);
  const reportError = useCallback((message: string) => pushToast(message, 'error'), []);

  const [view, setView] = useState<BookmarkView>('all');
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | undefined>(undefined);
  const [tagSlug, setTagSlug] = useState<string | undefined>(undefined);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [editor, setEditor] = useState<Bookmark | 'new' | null>(null);

  // 搜索防抖：250ms 后同步到查询条件。
  useEffect(() => {
    const draft = queryDraft.trim();
    if (draft === query) return;
    const timer = window.setTimeout(() => setQuery(draft), 250);
    return () => window.clearTimeout(timer);
  }, [queryDraft, query]);

  const page = useBookmarkPage({
    view,
    category: categorySlug,
    tag: tagSlug,
    pinned: pinnedOnly,
    query,
    onUnauthorized: handleUnauthorized,
    onError: reportError,
  });

  const loadTags = useCallback((signal: AbortSignal) => api.getTags(undefined, signal), []);
  const { data: tags, refresh: refreshTags } = useApiData(loadTags, {
    onUnauthorized: handleUnauthorized,
  });
  const loadCategories = useCallback(
    (signal: AbortSignal) => api.getCategories(undefined, signal),
    [],
  );
  const { data: categories, refresh: refreshCategories } = useApiData(loadCategories, {
    onUnauthorized: handleUnauthorized,
  });

  const { confirmState, mutate, askConfirm, setConfirmState } = useBookmarkMutations({
    refreshPage: page.refresh,
    reloadTags: refreshTags,
    reloadCategories: refreshCategories,
    onError: reportError,
  });

  const categoryOptions = useMemo(() => {
    const flat = flattenCategoryTree(buildCategoryTree(categories ?? []));
    return [
      { value: '', label: '全部分类' },
      { value: UNCATEGORIZED_SLUG, label: '未分类' },
      ...flat.map((item) => ({
        value: item.slug,
        label: `${'　'.repeat(Math.max(item.depth, 0))}${item.name}`,
      })),
    ];
  }, [categories]);

  const tagOptions = useMemo(
    () => [
      { value: '', label: '全部标签' },
      ...(tags ?? []).map((item) => ({ value: item.slug, label: item.name })),
    ],
    [tags],
  );

  function selectView(next: BookmarkView) {
    setView(next);
    if (next !== 'active') setPinnedOnly(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">网站管理</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          统一浏览全部书签（含归档与回收站），可搜索、筛选并直接整理。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="状态筛选"
          className="flex items-center rounded-lg border border-border/70 bg-card p-0.5 shadow-sm"
        >
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectView(item.id)}
              aria-pressed={view === item.id}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition',
                view === item.id
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 focus-within:border-primary/50">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder="搜索标题、网址或描述"
            aria-label="搜索书签"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {queryDraft ? (
            <button
              type="button"
              aria-label="清除搜索"
              onClick={() => {
                setQueryDraft('');
                setQuery('');
              }}
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <select
          value={categorySlug ?? ''}
          onChange={(event) => setCategorySlug(event.target.value || undefined)}
          aria-label="按分类筛选"
          className="h-9 rounded-lg border border-border/70 bg-card px-2.5 text-sm outline-none focus-visible:border-primary/50"
        >
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={tagSlug ?? ''}
          onChange={(event) => setTagSlug(event.target.value || undefined)}
          aria-label="按标签筛选"
          className="h-9 rounded-lg border border-border/70 bg-card px-2.5 text-sm outline-none focus-visible:border-primary/50"
        >
          {tagOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {view === 'active' ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={pinnedOnly}
              onCheckedChange={(checked) => setPinnedOnly(checked === true)}
            />
            仅常用
          </label>
        ) : null}

        <div
          role="group"
          aria-label="视图切换"
          className="flex items-center rounded-lg border border-border/70 bg-card p-0.5 shadow-sm"
        >
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon-sm"
            className="size-7 rounded-md"
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            aria-label="网格视图"
          >
            <LayoutGrid />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon-sm"
            className="size-7 rounded-md"
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            aria-label="列表视图"
          >
            <List />
          </Button>
        </div>

        <Button size="sm" onClick={() => setEditor('new')} className="ml-auto">
          <Plus />
          新建书签
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {page.loading ? '同步中…' : `当前筛选结果 ${page.items.length} 条`}
      </p>

      {page.loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : page.items.length === 0 ? (
        <div className="border-y border-border py-16 text-center">
          <Globe className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 font-medium">没有符合条件的书签</p>
          <p className="mt-1 text-sm text-muted-foreground">调整筛选条件，或新建一个书签。</p>
        </div>
      ) : (
        <>
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
                : 'grid gap-2',
            )}
          >
            {page.items.map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                viewMode={viewMode}
                onEdit={setEditor}
                onDelete={(item) =>
                  askConfirm({
                    title: `移入回收站「${item.title}」？`,
                    description: '可以将书签移入回收站，之后仍可从回收站恢复。',
                    confirmLabel: '移入回收站',
                    action: () => api.deleteBookmark('', item.id),
                  })
                }
                onTogglePin={(item) =>
                  void mutate(
                    () => api.updateBookmark('', item.id, { isPinned: !item.isPinned }),
                    item.isPinned ? '已取消常用' : '已加入常用',
                  )
                }
                onArchive={(item) =>
                  askConfirm({
                    title: `归档「${item.title}」？`,
                    description: '归档后书签会收藏到「归档」视图，可随时取消归档恢复。',
                    confirmLabel: '归档',
                    destructive: false,
                    action: () => api.archiveBookmark('', item.id),
                  })
                }
                onRestore={(id) => void mutate(() => api.restoreBookmark('', id), '已恢复')}
                onPermanentDelete={(item) =>
                  askConfirm({
                    title: `永久删除「${item.title}」？`,
                    description: '此操作不可撤销，记录将从回收站中彻底移除。',
                    confirmLabel: '永久删除',
                    action: () => api.permanentDeleteBookmark('', item.id),
                  })
                }
                onSelectTag={(slug) => setTagSlug(slug)}
                onSelectCategory={(slug) => setCategorySlug(slug)}
              />
            ))}
          </div>
          {page.hasMore ? (
            <div className="flex justify-center border-t border-border pt-5">
              <Button
                variant="outline"
                disabled={page.loadingMore}
                onClick={() => void page.loadMore()}
              >
                {page.loadingMore ? '加载中…' : '加载更多'}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Suspense fallback={null}>
        {editor !== null ? (
          <BookmarkForm
            open
            bookmark={editor === 'new' ? undefined : editor}
            availableTags={tags ?? []}
            availableCategories={categories ?? []}
            defaultCategoryId={
              editor === 'new' && categorySlug && categorySlug !== UNCATEGORIZED_SLUG
                ? (categories?.find((item) => item.slug === categorySlug)?.id ?? null)
                : null
            }
            onClose={() => setEditor(null)}
            onSubmit={async (input: BookmarkInput) => {
              if (editor !== 'new' && editor !== null)
                await api.updateBookmark('', editor.id, input);
              else await api.createBookmark('', input);
              setEditor(null);
              page.refresh();
              await refreshTags();
              await refreshCategories();
              pushToast(editor === 'new' ? '书签已创建' : '书签已更新', 'success');
            }}
          />
        ) : null}
      </Suspense>

      <ConfirmStateDialog state={confirmState} onClose={() => setConfirmState(null)} />
      <Toaster />
    </div>
  );
}
