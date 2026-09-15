import type { Bookmark, BookmarkInput, Category, Tag } from '@shared/api/types';

import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Bookmark as BookmarkIcon, LayoutGrid, List, Plus, Search, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { BookmarkCard } from '@nav/features/bookmarks/BookmarkCard';
import { ConfirmStateDialog } from '@nav/features/bookmarks/ConfirmStateDialog';
import { useBookmarkMutations } from '@nav/features/bookmarks/useBookmarkMutations';
import { useBookmarkPage } from '@nav/features/bookmarks/useBookmarkPage';
import { AppHeader } from '@nav/features/layout/AppHeader';
import { AppShell } from '@nav/features/layout/AppShell';
import { Brand } from '@nav/features/layout/Brand';
import { HeaderMenu } from '@nav/features/layout/HeaderMenu';
import { setPreferredFrontView } from '@nav/features/settings/store';
import { useBackground } from '@nav/hooks/useBackground';
import { useSettings } from '@nav/hooks/useSettings';
import { useTheme } from '@nav/hooks/useTheme';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

import { selectWorkspaceFilter, setWorkspaceQuery, type WorkspaceSearch } from './search';
import { WorkspaceSidebar } from './WorkspaceSidebar';

const routeApi = getRouteApi('/workspace');

const BookmarkForm = lazy(() =>
  import('@nav/features/bookmarks/BookmarkForm').then((module) => ({
    default: module.BookmarkForm,
  })),
);

const VIEW_MODE_KEY = 'nav-view-mode';

export function WorkspacePage() {
  const auth = useAuthContext();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const search = routeApi.useSearch();
  const { pinned, category, tag, untagged, q: query } = search;

  const handleUnauthorized = useCallback(() => {
    void auth.logout();
  }, [auth]);

  // 服务端设置仅用于背景图片；401 时登出
  const settings = useSettings(handleUnauthorized);
  useBackground(settings);

  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [editor, setEditor] = useState<Bookmark | 'new' | null>(null);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return window.localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  /** 本地搜索草稿：输入即时响应，250ms 后同步到 URL（replace），后退/前进再回填。 */
  const [queryDraft, setQueryDraft] = useState(search.q ?? '');
  useEffect(() => {
    setQueryDraft(search.q ?? '');
  }, [search.q]);
  useEffect(() => {
    const draft = queryDraft.trim();
    if (draft === (search.q ?? '')) return;
    const timer = window.setTimeout(() => {
      void navigate({
        to: '/workspace',
        search: (prev) => setWorkspaceQuery(prev, draft),
        replace: true,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [navigate, queryDraft, search.q]);

  function reportError(message: string) {
    pushToast(message, 'error');
  }

  const page = useBookmarkPage({
    view: 'active',
    category,
    tag,
    pinned: pinned === true,
    untagged,
    query: query ?? '',
    onUnauthorized: handleUnauthorized,
    onError: reportError,
  });

  async function loadTags() {
    try {
      setTags(await api.getTags());
      setTagsLoaded(true);
    } catch (error) {
      reportError(error instanceof Error ? error.message : '标签加载失败');
    }
  }

  async function loadCategories(): Promise<Category[] | null> {
    try {
      const result = await api.getCategories();
      setCategories(result);
      setCategoriesLoaded(true);
      return result;
    } catch (error) {
      reportError(error instanceof Error ? error.message : '分类加载失败');
      return null;
    }
  }

  useEffect(() => {
    void loadTags();
    void loadCategories();
    setPreferredFrontView('workspace');
  }, []);

  useEffect(() => {
    document.title = '书签柜';
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target as HTMLElement)?.closest('input,textarea')) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 仅在成功加载索引后判断失效，网络错误不会改写导航位置。
  useEffect(() => {
    const missingCategory =
      categoriesLoaded &&
      category &&
      category !== UNCATEGORIZED_SLUG &&
      !categories.some((item) => item.slug === category);
    const missingTag = tagsLoaded && tag && !tags.some((item) => item.slug === tag);
    if (missingCategory || missingTag) {
      setQueryDraft('');
      void navigate({ to: '/workspace', search: {}, replace: true });
    }
  }, [categories, categoriesLoaded, category, tags, tagsLoaded, tag, navigate]);

  function selectFilter(filter: Omit<WorkspaceSearch, 'q'>) {
    setQueryDraft('');
    void navigate({ to: '/workspace', search: selectWorkspaceFilter(filter) });
  }

  function selectCategory(slug: string) {
    selectFilter({ category: slug });
  }

  function selectTagFilter(slug: string) {
    selectFilter({ tag: slug });
  }

  function clearSearch() {
    setQueryDraft('');
    void navigate({
      to: '/workspace',
      search: (prev) => setWorkspaceQuery(prev, ''),
      replace: true,
    });
  }

  const selectedTagName = tag ? (tags.find((item) => item.slug === tag)?.name ?? tag) : null;
  const selectedCategoryName = category
    ? category === UNCATEGORIZED_SLUG
      ? '未分类'
      : (categories.find((item) => item.slug === category)?.name ?? category)
    : null;

  const { confirmState, mutate, askConfirm, setConfirmState } = useBookmarkMutations({
    refreshPage: page.refresh,
    reloadTags: loadTags,
    reloadCategories: loadCategories,
    onError: reportError,
  });

  const title = query
    ? `搜索 “${query}”`
    : category
      ? (selectedCategoryName ?? category)
      : tag
        ? (selectedTagName ?? tag)
        : untagged
          ? '无标签'
          : pinned
            ? '常用入口'
            : '全部网站';

  /** 书签卡片统一渲染：单分类/常用入口/标签/搜索共用的操作与筛选回调（恢复/永久删除只在管理后台）。 */
  const renderCard = (bookmark: Bookmark) => (
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
          successMessage: '已移入回收站',
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
          description: '归档后书签会移入「归档」状态，可在管理后台查看或恢复。',
          confirmLabel: '归档',
          destructive: false,
          successMessage: '已归档',
          action: () => api.archiveBookmark('', item.id),
        })
      }
      onSelectTag={selectTagFilter}
      onSelectCategory={selectCategory}
    />
  );

  const header = (
    <AppHeader
      navButton={<SidebarTrigger className="lg:hidden" aria-label="打开索引" />}
      brand={<Brand onClick={() => selectFilter({})} />}
      actions={
        <Button size="sm" onClick={() => setEditor('new')}>
          <Plus />
          <span className="hidden sm:inline">添加书签</span>
        </Button>
      }
      menu={
        <HeaderMenu
          theme={theme}
          onThemeChange={setTheme}
          onOpenLauncher={() => void navigate({ to: '/launch' })}
          onOpenAdmin={() => void navigate({ to: '/admin' })}
          onLogout={() => void auth.logout()}
        />
      }
    />
  );

  return (
    <>
      <AppShell
        header={header}
        sidebar={
          <WorkspaceSidebar
            categories={categories}
            tags={tags}
            search={search}
            onSelect={selectFilter}
          />
        }
      >
        <div className="mx-auto flex w-full flex-col gap-7 px-1 sm:px-2">
          <div className="flex h-11 items-center gap-3 rounded-full border border-border bg-card px-4 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="size-4.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="搜索标题、网址或描述"
              aria-label="搜索书签"
              onKeyDown={(event) => {
                if (event.key === 'Escape') clearSearch();
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {queryDraft ? (
              <Button variant="ghost" size="icon-sm" onClick={clearSearch} aria-label="清除搜索">
                <X />
              </Button>
            ) : (
              <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
                /
              </kbd>
            )}
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                书签柜
              </p>
              <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {page.loading ? '同步中…' : `已加载 ${page.items.length} 个书签`}
              </p>
            </div>
            <Tabs
              value={viewMode}
              onValueChange={(value) => setViewMode(value === 'list' ? 'list' : 'grid')}
              aria-label="视图切换"
              className="shrink-0"
            >
              <TabsList className="border border-border bg-card p-0.5">
                <TabsTrigger
                  value="grid"
                  aria-label="网格视图"
                  className="size-7 flex-none rounded-md px-0"
                >
                  <LayoutGrid />
                </TabsTrigger>
                <TabsTrigger
                  value="list"
                  aria-label="列表视图"
                  className="size-7 flex-none rounded-md px-0"
                >
                  <List />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {page.loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : page.items.length === 0 ? (
            <div className="border-y border-border py-16 text-center">
              <BookmarkIcon className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-3 font-medium">这里还没有书签</p>
              <p className="mt-1 text-sm text-muted-foreground">粘贴一个网址，给它一个标签。</p>
            </div>
          ) : (
            <div
              className={cn(
                viewMode === 'grid'
                  ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
                  : 'grid gap-2',
              )}
            >
              {page.items.map(renderCard)}
            </div>
          )}
        </div>
      </AppShell>
      <Toaster />
      <Suspense fallback={null}>
        {editor !== null ? (
          <BookmarkForm
            open
            bookmark={editor === 'new' ? undefined : editor}
            availableTags={tags}
            availableCategories={categories}
            defaultCategoryId={
              editor === 'new' && category && category !== UNCATEGORIZED_SLUG
                ? (categories.find((item) => item.slug === category)?.id ?? null)
                : null
            }
            onClose={() => setEditor(null)}
            onSubmit={async (input: BookmarkInput) => {
              if (editor !== 'new' && editor !== null)
                await api.updateBookmark('', editor.id, input);
              else await api.createBookmark('', input);
              setEditor(null);
              page.refresh();
              await loadTags();
              await loadCategories();
              pushToast(editor === 'new' ? '书签已创建' : '书签已更新', 'success');
            }}
          />
        ) : null}
      </Suspense>
      <ConfirmStateDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
