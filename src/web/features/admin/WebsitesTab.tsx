import type { Bookmark, BookmarkInput, BookmarkView } from '@shared/api/types';

import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Globe,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Toaster } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { ConfirmStateDialog } from '@nav/features/bookmarks/ConfirmStateDialog';
import { useBookmarkMutations } from '@nav/features/bookmarks/useBookmarkMutations';
import { PAGE_SIZES, usePagedBookmarks } from '@nav/features/bookmarks/usePagedBookmarks';
import { CategoryFilter } from '@nav/features/categories/CategoryFilter';
import { useApiData } from '@nav/hooks/useApiData';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';
import { domainOf } from '@shared/search';

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

function BookmarkRowIcon({ bookmark }: { bookmark: Bookmark }) {
  const domain = domainOf(bookmark.url);

  return (
    <ImageWithFallback
      src={bookmark.iconUrl}
      className="size-7 shrink-0 rounded-lg border border-border/70 bg-card object-contain p-0.5"
      loading="lazy"
      fallback={
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-border/70 bg-muted text-xs font-semibold text-primary">
          {domain.charAt(0).toUpperCase()}
        </span>
      }
    />
  );
}

/**
 * 后台专用的网站（书签）轻量化表格管理：
 * 固定宽度紧凑表格（标题 + 网址），页码分页（10/20/50/100），分类筛选为可折叠树。
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
  const [pageSize, setPageSize] = useState<number>(20);
  const [editor, setEditor] = useState<Bookmark | 'new' | null>(null);

  // 搜索防抖：250ms 后同步到查询条件。
  useEffect(() => {
    const draft = queryDraft.trim();
    if (draft === query) return;
    const timer = window.setTimeout(() => setQuery(draft), 250);
    return () => window.clearTimeout(timer);
  }, [queryDraft, query]);

  const page = usePagedBookmarks({
    view,
    category: categorySlug,
    tag: tagSlug,
    pinned: pinnedOnly,
    query,
    pageSize,
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
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">网站管理</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          以紧凑表格统一查看与整理全部书签（含归档与回收站），支持页码分页与分类/标签筛选。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="状态筛选"
          className="flex items-center rounded-lg border border-border/70 bg-card p-0.5"
        >
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectView(item.id)}
              aria-pressed={view === item.id}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                view === item.id
                  ? 'bg-primary/10 text-primary'
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

        <CategoryFilter
          categories={categories ?? []}
          selectedSlug={categorySlug}
          onSelect={setCategorySlug}
        />

        <select
          value={tagSlug ?? ''}
          onChange={(event) => setTagSlug(event.target.value || undefined)}
          aria-label="按标签筛选"
          className="h-9 rounded-lg border border-border/70 bg-card px-2.5 text-xs outline-none focus-visible:border-primary/50"
        >
          {tagOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {view === 'active' ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
            <Checkbox
              checked={pinnedOnly}
              onCheckedChange={(checked) => setPinnedOnly(checked === true)}
            />
            仅常用
          </label>
        ) : null}

        <Button size="sm" onClick={() => setEditor('new')} className="ml-auto">
          <Plus className="size-4" />
          新建书签
        </Button>
      </div>

      <div className="flex items-center justify-between px-0.5 text-xs text-muted-foreground">
        <span>{page.loading ? '同步中…' : `共 ${page.total} 条书签`}</span>
      </div>

      {page.loading ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : page.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-16 text-center">
          <Globe className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">没有符合条件的书签</p>
          <p className="mt-1 text-xs text-muted-foreground">调整筛选条件，或新建一个书签。</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {/* table-fixed + w-full：列宽固定、内容截断，避免横向滚动 */}
          <Table className="table-fixed">
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="text-xs font-semibold">网站</TableHead>
                <TableHead className="w-[5rem] text-center text-xs font-semibold">状态</TableHead>
                <TableHead className="w-[7.5rem] pr-4 text-right text-xs font-semibold">
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((bookmark) => {
                const active = !bookmark.deletedAt && !bookmark.archivedAt;

                return (
                  <TableRow key={bookmark.id} className="group border-border/60">
                    {/* 网站：favicon + 标题 + 网址（同一格内截断） */}
                    <TableCell className="py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <BookmarkRowIcon bookmark={bookmark} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-foreground">
                              {bookmark.title}
                            </span>
                            {bookmark.isPinned ? (
                              <span title="常用书签" className="shrink-0 text-primary">
                                <Star className="size-3 fill-current" />
                              </span>
                            ) : null}
                          </div>
                          <a
                            href={bookmark.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-muted-foreground transition hover:text-primary"
                            title={bookmark.url}
                          >
                            <span className="truncate">{domainOf(bookmark.url)}</span>
                            <ExternalLink className="size-2.5 shrink-0 opacity-60" />
                          </a>
                        </div>
                      </div>
                    </TableCell>

                    {/* 状态 */}
                    <TableCell className="py-2.5 text-center">
                      {bookmark.deletedAt ? (
                        <Badge variant="destructive">回收站</Badge>
                      ) : bookmark.archivedAt ? (
                        <Badge variant="secondary">已归档</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-primary/30 bg-primary/10 text-primary"
                        >
                          活动
                        </Badge>
                      )}
                    </TableCell>

                    {/* 操作 */}
                    <TableCell className="py-2.5 pr-3 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {active ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                void mutate(
                                  () =>
                                    api.updateBookmark('', bookmark.id, {
                                      isPinned: !bookmark.isPinned,
                                    }),
                                  bookmark.isPinned ? '已取消常用' : '已加入常用',
                                )
                              }
                              aria-label="切换常用"
                              title={bookmark.isPinned ? '取消常用' : '设为常用'}
                            >
                              <Star
                                className={cn(
                                  'size-3.5',
                                  bookmark.isPinned && 'fill-current text-primary',
                                )}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setEditor(bookmark)}
                              aria-label="编辑"
                              title="编辑书签"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                askConfirm({
                                  title: `归档「${bookmark.title}」？`,
                                  description: '归档后书签会移入「归档」视图，可随时取消归档恢复。',
                                  confirmLabel: '归档',
                                  destructive: false,
                                  action: () => api.archiveBookmark('', bookmark.id),
                                })
                              }
                              aria-label="归档"
                              title="归档"
                            >
                              <Archive className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                askConfirm({
                                  title: `移入回收站「${bookmark.title}」？`,
                                  description: '可以将书签移入回收站，之后仍可从回收站恢复。',
                                  confirmLabel: '移入回收站',
                                  action: () => api.deleteBookmark('', bookmark.id),
                                })
                              }
                              aria-label="移入回收站"
                              title="移入回收站"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        ) : bookmark.deletedAt ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                void mutate(() => api.restoreBookmark('', bookmark.id), '已恢复')
                              }
                              aria-label="恢复"
                              title="从回收站恢复"
                            >
                              <Undo2 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                askConfirm({
                                  title: `永久删除「${bookmark.title}」？`,
                                  description: '此操作不可撤销，记录将从回收站中彻底移除。',
                                  confirmLabel: '永久删除',
                                  action: () => api.permanentDeleteBookmark('', bookmark.id),
                                })
                              }
                              aria-label="永久删除"
                              title="彻底删除"
                              className="text-destructive hover:text-destructive"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                void mutate(() => api.restoreBookmark('', bookmark.id), '已恢复')
                              }
                              aria-label="取消归档"
                              title="恢复到活动书签"
                            >
                              <ArchiveRestore className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setEditor(bookmark)}
                              aria-label="编辑"
                              title="编辑书签"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* 分页：页大小 10/20/50/100 + 上一页/下一页 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/20 p-3">
            <span className="text-xs text-muted-foreground">
              共 {page.total} 条 · 第 {page.page} / {page.totalPages} 页
            </span>
            <div className="flex items-center gap-1.5">
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                aria-label="每页条数"
                className="h-8 rounded-lg border border-border/70 bg-card px-2 text-xs outline-none focus-visible:border-primary/50"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} 条/页
                  </option>
                ))}
              </select>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      text="上一页"
                      aria-disabled={page.page <= 1 || page.loading}
                      onClick={(event) => {
                        event.preventDefault();
                        if (page.page > 1 && !page.loading) page.setPage(page.page - 1);
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      text="下一页"
                      aria-disabled={page.page >= page.totalPages || page.loading}
                      onClick={(event) => {
                        event.preventDefault();
                        if (page.page < page.totalPages && !page.loading)
                          page.setPage(page.page + 1);
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </div>
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
