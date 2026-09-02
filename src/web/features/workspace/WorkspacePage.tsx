import type { Bookmark, BookmarkInput, Category, Tag } from '@shared/api/types';

import { getRouteApi, useNavigate } from '@tanstack/react-router';
import {
  Bookmark as BookmarkIcon,
  FolderTree,
  LayoutGrid,
  List,
  Menu,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { BookmarkCard } from '@nav/features/bookmarks/BookmarkCard';
import { ConfirmStateDialog } from '@nav/features/bookmarks/ConfirmStateDialog';
import { useBookmarkMutations } from '@nav/features/bookmarks/useBookmarkMutations';
import { useBookmarkPage } from '@nav/features/bookmarks/useBookmarkPage';
import { CategorySidebar } from '@nav/features/categories/CategorySidebar';
import { AppHeader } from '@nav/features/layout/AppHeader';
import { AppShell } from '@nav/features/layout/AppShell';
import { Brand } from '@nav/features/layout/Brand';
import { HeaderMenu } from '@nav/features/layout/HeaderMenu';
import { setPreferredFrontView } from '@nav/features/settings/store';
import { TagFilter } from '@nav/features/tags/TagFilter';
import { useBackground } from '@nav/hooks/useBackground';
import { useSettings } from '@nav/hooks/useSettings';
import { useTheme } from '@nav/hooks/useTheme';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

import { isDefaultLanding, resolveDefaultCategorySlug, resolveWorkspaceSearch } from './search';
import { getRememberedCategory, rememberCategory } from './storage';

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
  const { pinned, category, tag, q: query } = resolveWorkspaceSearch(search);
  /** 裸入口：URL 无任何筛选（也非常用入口/搜索），等待默认分类注入，不再有「全部网站」落地。 */
  const bare = isDefaultLanding({ pinned, category, tag, q: query });

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
  const [navOpen, setNavOpen] = useState(false);
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
        search: (prev) => ({ ...prev, q: draft || undefined }),
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
    pinned: pinned && !tag && !category,
    query: query ?? '',
    // 裸入口（URL 尚无分类位置）时暂缓取数：等默认分类注入 URL 后再取，避免先全量取一次再按分类重取。
    pending: bare,
    onUnauthorized: handleUnauthorized,
    onError: reportError,
  });

  async function loadTags() {
    try {
      setTags(await api.getTags());
    } catch (error) {
      reportError(error instanceof Error ? error.message : '标签加载失败');
    }
  }

  async function loadCategories(): Promise<Category[] | null> {
    try {
      const result = await api.getCategories();
      setCategories(result);
      return result;
    } catch (error) {
      reportError(error instanceof Error ? error.message : '分类加载失败');
      return null;
    } finally {
      setCategoriesLoaded(true);
    }
  }

  useEffect(() => {
    void loadTags();
    void loadCategories();
    setPreferredFrontView('workspace');
  }, []);

  /**
   * 裸入口注入默认分类：URL 无任何筛选时，等分类加载后落到「记忆分类 → 第一个根分类 → 未分类」，
   * 以 replace 写回 URL（保持深链/回退语义），取代旧的「全部网站」落地视图。
   */
  useEffect(() => {
    if (!categoriesLoaded || !bare) return;
    const slug = resolveDefaultCategorySlug(categories, getRememberedCategory());
    void navigate({
      to: '/workspace',
      search: (prev) => ({ ...prev, category: slug }),
      replace: true,
    });
  }, [bare, categories, categoriesLoaded, navigate]);

  /** 记录最近浏览的分类位置：点击、深链、注入路径统一在此记忆（含「未分类」）。 */
  useEffect(() => {
    if (!categoriesLoaded || !category) return;
    if (category === UNCATEGORIZED_SLUG || categories.some((item) => item.slug === category)) {
      rememberCategory(category);
    }
  }, [categories, categoriesLoaded, category]);

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

  /** 管理后台删除了当前筛选的分类时，跳到新的默认分类（记忆 → 第一个根分类 → 未分类），保留标签。 */
  useEffect(() => {
    if (
      categoriesLoaded &&
      category &&
      category !== UNCATEGORIZED_SLUG &&
      !categories.some((item) => item.slug === category)
    ) {
      const slug = resolveDefaultCategorySlug(categories, getRememberedCategory());
      void navigate({
        to: '/workspace',
        search: (prev) => ({ ...prev, category: slug }),
        replace: true,
      });
    }
  }, [categories, categoriesLoaded, category, navigate]);

  /** 进入「常用入口」：显式 pinned=true。 */
  function goCommon() {
    setNavOpen(false);
    void navigate({
      to: '/workspace',
      search: { pinned: true, category: undefined, tag: undefined, q: undefined },
    });
  }

  /** 「常用入口」切换：已在常用入口时回到默认分类（不再写 pinned=false，也没有「全部网站」可回）。 */
  function toggleCommon() {
    if (pinned && !category && !tag) {
      setNavOpen(false);
      const slug = categoriesLoaded
        ? resolveDefaultCategorySlug(categories, getRememberedCategory())
        : undefined;
      void navigate({
        to: '/workspace',
        search: {
          category: slug,
          tag: undefined,
          q: undefined,
        },
      });
      return;
    }
    goCommon();
  }

  /** 选择分类筛选：保留已选标签，二者可叠加；点击当前分类保持选中（不再有「取消筛选回全部」）。 */
  function selectCategory(slug: string) {
    setNavOpen(false);
    if (slug === category) return;
    void navigate({
      to: '/workspace',
      search: (prev) => ({
        ...prev,
        // 进入分类筛选即离开「常用入口」，清除 pinned（写 undefined 表示省略，不产生 pinned=false）。
        pinned: undefined,
        category: slug,
        q: undefined,
      }),
    });
  }

  /** 选择/清除标签筛选：保留已选分类，二者可叠加。 */
  function selectTagFilter(next: string | undefined) {
    setNavOpen(false);
    void navigate({
      to: '/workspace',
      search: (prev) => ({
        ...prev,
        pinned: undefined,
        tag: next,
        q: undefined,
      }),
    });
  }

  function clearSearch() {
    setQueryDraft('');
    void navigate({
      to: '/workspace',
      search: (prev) => ({ ...prev, q: undefined }),
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
        : pinned
          ? '常用入口'
          : '加载中…';

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
          action: () => api.archiveBookmark('', item.id),
        })
      }
      onSelectTag={selectTagFilter}
      onSelectCategory={selectCategory}
    />
  );

  const header = (
    <AppHeader
      navButton={
        <button
          className="grid size-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
          onClick={() => setNavOpen(true)}
          aria-label="打开索引"
        >
          <Menu />
        </button>
      }
      brand={<Brand onClick={goCommon} />}
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

  const sidebar = (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between lg:hidden">
        <span className="font-display text-lg font-semibold">索引</span>
        <Button variant="ghost" size="icon-sm" onClick={() => setNavOpen(false)}>
          <X />
        </Button>
      </div>
      <div className="grid gap-1">
        <button
          onClick={toggleCommon}
          className={cn('nav-item', pinned && !tag && !category && 'nav-item-active')}
        >
          <Star />
          常用入口
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col border-t border-border/80 pt-5">
        <div className="mb-3 flex items-center gap-2 px-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <FolderTree className="size-3.5" />
          分类
          <span className="ml-auto font-mono text-[10px] font-normal tracking-normal">
            {categories.length}
          </span>
        </div>
        <CategorySidebar
          categories={categories}
          selectedSlug={category}
          onSelect={selectCategory}
        />
      </div>
      <div className="mt-auto border-t border-border pt-3">
        <p className="px-2 text-[11px] text-muted-foreground">私人索引 · 自动保存</p>
      </div>
    </div>
  );

  return (
    <>
      <AppShell
        header={header}
        sidebar={sidebar}
        navOpen={navOpen}
        onCloseNav={() => setNavOpen(false)}
      >
        <div className="mx-auto w-full space-y-7 px-1 sm:px-2">
          <div className="flex items-center gap-3 rounded-[1.1rem] border border-border/70 bg-card px-4 py-3.5 shadow-sm transition focus-within:border-primary/50 focus-within:shadow-md">
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
          <TagFilter tags={tags} selected={tag} onSelect={selectTagFilter} />
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium tracking-[0.18em] text-primary uppercase">
                你的网络入口
              </p>
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {page.loading ? '同步中…' : `已加载 ${page.items.length} 个书签`}
              </p>
            </div>
            <div
              role="group"
              aria-label="视图切换"
              className="flex shrink-0 items-center rounded-lg border border-border/70 bg-card p-0.5 shadow-sm"
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
          </div>
          {page.loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-xl bg-muted" />
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
