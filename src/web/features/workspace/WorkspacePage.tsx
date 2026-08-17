import type { Bookmark, BookmarkInput, CategoryInput, CategoryNode } from '@nav/api/types';

import {
  Bookmark as BookmarkIcon,
  ChevronRight,
  Database,
  FolderPlus,
  Globe,
  List,
  Plus,
  Search,
  Settings,
  Star,
  X,
} from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@nav/api/client';
import { EmptyState } from '@nav/components/EmptyState';
import { LoadingState } from '@nav/components/LoadingState';
import { pushToast } from '@nav/components/Toast';
import { BookmarkCard } from '@nav/features/bookmarks/BookmarkCard';
import { CategoryTree } from '@nav/features/categories/CategoryTree';
import { useTreeCollapse } from '@nav/features/categories/useTreeCollapse';
import { AppShell } from '@nav/features/layout/AppShell';
import { useDebouncedValue } from '@nav/hooks/useDebouncedValue';
import { readNavLocation, writeNavLocation } from '@nav/hooks/useNavLocation';
import { useTheme } from '@nav/hooks/useTheme';
import {
  buildCategoryLookup,
  buildCountMap,
  countBookmarks,
  findCategoryById,
  findAncestorPath,
} from '@nav/utils/bookmarks';

const BookmarkForm = lazy(() =>
  import('@nav/features/bookmarks/BookmarkForm').then((m) => ({ default: m.BookmarkForm })),
);
const CategoryForm = lazy(() =>
  import('@nav/features/categories/CategoryForm').then((m) => ({ default: m.CategoryForm })),
);
const ImportExportPanel = lazy(() =>
  import('@nav/features/import-export/ImportExportPanel').then((m) => ({
    default: m.ImportExportPanel,
  })),
);
const SettingsPanel = lazy(() =>
  import('@nav/features/settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);
const HeaderMenu = lazy(() =>
  import('@nav/features/layout/HeaderMenu').then((m) => ({ default: m.HeaderMenu })),
);
const ConfirmDialog = lazy(() =>
  import('@nav/components/ConfirmDialog').then((m) => ({ default: m.ConfirmDialog })),
);

type BookmarkEditorState = {
  mode: 'create' | 'edit';
  bookmark?: Bookmark;
};

type CategoryEditorState = {
  mode: 'create' | 'edit';
  category?: CategoryNode;
};

type ConfirmState = {
  title: string;
  body: string;
  successMessage: string;
  run: () => Promise<void>;
};

function countCategories(tree: CategoryNode[]): number {
  return tree.reduce((total, node) => total + 1 + countCategories(node.children), 0);
}

function statsFromTree(tree: CategoryNode[]) {
  return {
    categoryCount: countCategories(tree),
    bookmarkCount: countBookmarks(tree),
  };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export type WorkspacePageProps = {
  authed: boolean;
  logout: () => Promise<void>;
};

export function WorkspacePage({ authed, logout }: WorkspacePageProps) {
  const reduceMotion = useReducedMotion();
  const { theme, setTheme } = useTheme();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [globalBookmarks, setGlobalBookmarks] = useState<Bookmark[] | null>(null);
  const [bookmarksRefreshKey, setBookmarksRefreshKey] = useState(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(() => {
    const location = readNavLocation();
    return location.kind === 'folder' ? location.categoryId : null;
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [globalBookmarksLoading, setGlobalBookmarksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);
  const [bookmarkEditor, setBookmarkEditor] = useState<BookmarkEditorState | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [pinnedBookmarks, setPinnedBookmarks] = useState<Bookmark[]>([]);
  const [showPinned, setShowPinned] = useState(() => readNavLocation().kind === 'home');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('nav-view-mode') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('nav-view-mode', viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const debouncedSearch = useDebouncedValue(search, 300);

  async function loadCategories(options?: {
    quiet?: boolean;
    refreshBookmarks?: boolean;
    signal?: AbortSignal;
  }) {
    const quiet = options?.quiet ?? false;
    if (!quiet) {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await api.getCategories(undefined, options?.signal);
      setCategories(data);
      if (selectedCategoryId !== null && !findCategoryById(data, selectedCategoryId)) {
        setSelectedCategoryId(null);
        if (!showPinned) {
          setShowPinned(true);
          writeNavLocation({ kind: 'home' });
        }
      }
      if (options?.refreshBookmarks) {
        setGlobalBookmarks(null);
        setBookmarksRefreshKey((value) => value + 1);
      }
    } catch (caught) {
      if (isAbortError(caught)) return;
      if (caught instanceof ApiError && caught.status === 401) {
        logout();
      }
      setError(caught instanceof Error ? caught.message : '加载失败');
    } finally {
      if (!quiet && !options?.signal?.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!authed) {
      setCategories([]);
      setBookmarks([]);
      setPinnedBookmarks([]);
      setGlobalBookmarks(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void loadCategories({ signal: controller.signal });
    return () => controller.abort();
  }, [authed]);

  useEffect(() => {
    if (!authed || selectedCategoryId === null || showPinned || debouncedSearch.trim().length > 0) {
      if (selectedCategoryId === null) setBookmarks([]);
      setBookmarksError(null);
      setBookmarksLoading(false);
      return;
    }

    const controller = new AbortController();
    setBookmarksLoading(true);
    setBookmarksError(null);
    void api
      .getBookmarks(undefined, selectedCategoryId, true, controller.signal)
      .then(setBookmarks)
      .catch((caught) => {
        if (isAbortError(caught)) return;
        if (caught instanceof ApiError && caught.status === 401) {
          logout();
        }
        setBookmarksError(caught instanceof Error ? caught.message : '加载书签失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBookmarksLoading(false);
      });

    return () => controller.abort();
  }, [authed, bookmarksRefreshKey, debouncedSearch, selectedCategoryId, showPinned]);

  useEffect(() => {
    if (!authed || !showPinned || debouncedSearch.trim().length > 0) return;

    const controller = new AbortController();
    void api
      .getPinnedBookmarks(undefined, controller.signal)
      .then(setPinnedBookmarks)
      .catch((caught) => {
        if (!isAbortError(caught)) setPinnedBookmarks([]);
      });
    return () => controller.abort();
  }, [authed, bookmarksRefreshKey, debouncedSearch, showPinned]);

  useEffect(() => {
    if (!authed || debouncedSearch.trim().length === 0) {
      setGlobalBookmarks(null);
      setGlobalBookmarksLoading(false);
      return;
    }

    const controller = new AbortController();
    setGlobalBookmarksLoading(true);
    setBookmarksError(null);
    void api
      .searchBookmarks(undefined, debouncedSearch.trim(), controller.signal)
      .then(setGlobalBookmarks)
      .catch((caught) => {
        if (isAbortError(caught)) return;
        if (caught instanceof ApiError && caught.status === 401) {
          logoutRef.current();
        }
        setBookmarksError(caught instanceof Error ? caught.message : '搜索失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setGlobalBookmarksLoading(false);
      });

    return () => controller.abort();
  }, [authed, debouncedSearch]);

  // "/" focuses search
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedCategory = useMemo(
    () => (selectedCategoryId === null ? null : findCategoryById(categories, selectedCategoryId)),
    [categories, selectedCategoryId],
  );
  const categoryLookup = useMemo(() => buildCategoryLookup(categories), [categories]);
  const countMap = useMemo(() => buildCountMap(categories), [categories]);
  const treeCollapse = useTreeCollapse(categories, selectedCategoryId);

  const breadcrumbs = useMemo(() => {
    if (selectedCategoryId === null) {
      return [];
    }
    const path = findAncestorPath(categories, selectedCategoryId);
    if (selectedCategory) {
      return [...path, selectedCategory];
    }
    return path;
  }, [categories, selectedCategoryId, selectedCategory]);

  const isSearching = search.trim().length > 0;
  const deferredSearch = useDeferredValue(search);
  const isSearchingDeferred = deferredSearch.trim().length > 0;
  const visibleBookmarks = useMemo(() => {
    if (isSearchingDeferred) {
      return globalBookmarks ?? [];
    }
    if (showPinned) {
      return pinnedBookmarks;
    }
    return bookmarks;
  }, [bookmarks, isSearchingDeferred, globalBookmarks, showPinned, pinnedBookmarks]);
  const stats = useMemo(() => statsFromTree(categories), [categories]);
  const visibleBookmarksLoading = isSearchingDeferred
    ? globalBookmarksLoading && globalBookmarks === null
    : showPinned
      ? false
      : bookmarksLoading;
  const { collapsed, toggle } = treeCollapse;
  const showTopLoader = loading || bookmarksLoading || globalBookmarksLoading;

  const handleEditBookmark = useCallback((bookmark: Bookmark) => {
    setBookmarkEditor({ mode: 'edit', bookmark });
  }, []);

  const handleDeleteBookmark = useCallback((id: number) => {
    setConfirm({
      title: '删除书签',
      body: '删除后无法恢复。',
      successMessage: '书签已删除',
      run: async () => {
        await api.deleteBookmark('', id);
      },
    });
  }, []);

  const handleTogglePin = useCallback(
    (bookmark: Bookmark) => {
      void (async () => {
        try {
          await api.updateBookmark('', bookmark.id, { isPinned: !bookmark.isPinned });
          await loadCategories({ quiet: true, refreshBookmarks: true });
          pushToast(bookmark.isPinned ? '已取消收藏' : '已加入收藏', 'success');
        } catch (caught) {
          if (caught instanceof ApiError && caught.status === 401) {
            void logout();
            return;
          }
          pushToast(caught instanceof Error ? caught.message : '操作失败', 'error');
        }
      })();
    },
    [logout],
  );

  const handleEditCategory = useCallback((category: CategoryNode) => {
    setCategoryEditor({ mode: 'edit', category });
  }, []);

  const handleDeleteCategory = useCallback((category: CategoryNode) => {
    setConfirm({
      title: '删除文件夹',
      body: '将同时删除子文件夹与其中的书签，无法恢复。',
      successMessage: '文件夹已删除',
      run: async () => {
        await api.deleteCategory('', category.id);
      },
    });
  }, []);

  const handleSelectCategory = useCallback((id: number) => {
    setSelectedCategoryId(id);
    setShowPinned(false);
    setSearch('');
    setNavOpen(false);
    writeNavLocation({ kind: 'folder', categoryId: id });
  }, []);

  const handleToggleCategory = useCallback(
    (id: number) => {
      toggle(id);
    },
    [toggle],
  );

  const goHome = useCallback(() => {
    setShowPinned(true);
    setSearch('');
    setNavOpen(false);
    writeNavLocation({ kind: 'home' });
  }, []);

  useEffect(() => {
    const base = '私人书签柜';
    if (isSearching) {
      document.title = `搜索：${search.trim()} · ${base}`;
    } else if (showPinned) {
      document.title = `首页 · ${base}`;
    } else if (selectedCategory) {
      document.title = `${selectedCategory.name} · ${base}`;
    } else {
      document.title = base;
    }
  }, [isSearching, search, selectedCategory, showPinned]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedCategoryId, isSearching, showPinned, reduceMotion]);

  async function runAdminAction(action: () => Promise<void>, successMessage?: string) {
    try {
      await action();
      await loadCategories({ quiet: true, refreshBookmarks: true });
      if (successMessage) {
        pushToast(successMessage, 'success');
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        void logout();
        throw caught;
      }
      pushToast(caught instanceof Error ? caught.message : '操作失败', 'error');
      throw caught;
    }
  }

  async function saveBookmark(input: BookmarkInput, bookmark?: Bookmark) {
    await runAdminAction(
      async () => {
        if (bookmark) {
          await api.updateBookmark('', bookmark.id, input);
          return;
        }
        await api.createBookmark('', input);
      },
      bookmark ? '书签已更新' : '书签已创建',
    );
    setBookmarkEditor(null);
  }

  async function saveCategory(input: CategoryInput, id?: number) {
    await runAdminAction(
      async () => {
        if (id) {
          await api.updateCategory('', id, input);
          return;
        }
        await api.createCategory('', input);
      },
      id ? '文件夹已更新' : '文件夹已创建',
    );
    setCategoryEditor(null);
  }

  async function runConfirm() {
    if (!confirm) {
      return;
    }
    setConfirmLoading(true);
    try {
      await runAdminAction(confirm.run, confirm.successMessage);
      setConfirm(null);
    } catch {
      /* toast already shown */
    } finally {
      setConfirmLoading(false);
    }
  }

  const sectionTitle = isSearching
    ? `搜索「${search.trim()}」`
    : showPinned
      ? '首页'
      : (selectedCategory?.name ?? '书签');

  const sectionMeta = visibleBookmarksLoading
    ? '加载中…'
    : isSearching
      ? `${visibleBookmarks.length} 个结果`
      : showPinned
        ? `${visibleBookmarks.length} 个收藏网站`
        : `${visibleBookmarks.length} 个书签 · 含子文件夹`;

  const header = (
    <div className="flex h-[var(--header-h)] w-full max-w-full min-w-0 items-center">
      {/* Aligns with sidebar column — flush left on lg+ */}
      <div className="flex h-full min-w-0 shrink items-center gap-2 px-3 sm:px-5 lg:w-[15.5rem] lg:shrink-0 lg:border-r lg:border-border lg:px-3 xl:w-[16.5rem]">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
          aria-label="打开分类"
        >
          <List size={18} />
        </button>
        <button
          type="button"
          onClick={goHome}
          className="flex min-w-0 items-center gap-2 rounded-md text-left outline-none"
        >
          <img
            src="/icons/icon-32.png"
            srcSet="/icons/icon-32.png 1x, /icons/icon-64.png 2x"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-md object-cover"
            decoding="async"
          />
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-semibold tracking-tight text-foreground">
              私人书签柜
            </span>
            <span className="mt-1 block h-0.5 w-10 rounded-full bg-seal" aria-hidden />
          </span>
        </button>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 px-2 sm:gap-2 sm:px-4 lg:px-6">
        <Button variant="default" size="sm" onClick={() => setBookmarkEditor({ mode: 'create' })}>
          <Plus data-icon="inline-start" />
          <span className="hidden sm:inline">添加书签</span>
          <span className="sm:hidden">添加</span>
        </Button>

        <Suspense
          fallback={
            <span
              className="inline-block h-9 w-14 rounded-full border border-input"
              aria-hidden="true"
            />
          }
        >
          <HeaderMenu
            theme={theme}
            viewMode={viewMode}
            onThemeChange={setTheme}
            onViewModeChange={setViewMode}
            onLogout={() => {
              void logout();
              pushToast('已退出', 'info');
            }}
          />
        </Suspense>
      </div>
    </div>
  );

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between lg:hidden">
        <span className="text-sm font-semibold text-foreground">导航</span>
        <Button variant="ghost" size="icon-sm" onClick={() => setNavOpen(false)} aria-label="关闭">
          <X size={16} />
        </Button>
      </div>

      <button
        type="button"
        onClick={goHome}
        className={cn(
          'flex items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] transition',
          showPinned && !isSearching
            ? 'bg-amber-500/15 font-medium text-amber-500'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <span className="flex items-center gap-2">
          <Star size={15} className={showPinned && !isSearching ? 'fill-current' : ''} />
          首页
        </span>
        {pinnedBookmarks.length > 0 ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {pinnedBookmarks.length}
          </span>
        ) : null}
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="mb-1.5 px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          文件夹
        </p>
        <CategoryTree
          categories={categories}
          selectedCategoryId={isSearching || showPinned ? null : selectedCategoryId}
          collapsed={collapsed}
          countMap={countMap}
          onSelect={handleSelectCategory}
          onToggle={handleToggleCategory}
          onEdit={handleEditCategory}
          onDelete={handleDeleteCategory}
        />
      </div>

      <div className="flex shrink-0 flex-col gap-0.5 pt-2">
        <Separator className="mb-1" />
        <button
          type="button"
          onClick={() => {
            setCategoryEditor({ mode: 'create' });
            setNavOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <FolderPlus size={15} />
          新建文件夹
        </button>
        <button
          type="button"
          onClick={() => {
            setTransferOpen(true);
            setNavOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Database size={15} />
          导入 / 导出
        </button>
        <button
          type="button"
          onClick={() => {
            setSettingsOpen(true);
            setNavOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Settings size={15} />
          设置
        </button>
      </div>
    </div>
  );

  return (
    <>
      {showTopLoader ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-60 h-0.5 overflow-hidden"
          aria-hidden
        >
          <span className="block h-full w-[35%] animate-load-slide bg-primary" />
        </div>
      ) : null}

      <AppShell
        header={header}
        sidebar={sidebar}
        navOpen={navOpen}
        onCloseNav={() => setNavOpen(false)}
      >
        <div className="flex w-full min-w-0 flex-col gap-4">
          <label className="flex min-h-11 w-full items-center gap-2.5 rounded-[calc(var(--radius)*0.9)] border border-border bg-card px-3.5 shadow-[0_1px_0_oklch(0_0_0/0.02)] transition-[border-color,box-shadow,background-color] focus-within:border-primary/55 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_16%,transparent)] hover:border-border-strong">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索标题、网址或描述"
              aria-label="搜索书签"
              className="w-full min-w-0 border-0 bg-transparent text-[0.9rem] leading-snug tracking-tight text-foreground outline-none placeholder:text-muted-foreground/80"
            />
            {isSearching ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="清除搜索"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                /
              </kbd>
            )}
          </label>

          {/* Breadcrumb + meta */}
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
            <nav
              className="flex max-w-full min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground"
              aria-label="当前位置"
            >
              <button
                type="button"
                onClick={goHome}
                className="shrink-0 rounded px-1 py-0.5 transition hover:bg-muted hover:text-foreground"
              >
                首页
              </button>
              {isSearching ? (
                <>
                  <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium text-foreground">搜索</span>
                </>
              ) : showPinned ? null : (
                breadcrumbs.map((crumb) => (
                  <span key={crumb.id} className="flex min-w-0 items-center gap-1">
                    <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => handleSelectCategory(crumb.id)}
                      className={cn(
                        'min-w-0 truncate rounded px-1 py-0.5 transition hover:bg-muted',
                        crumb.id === selectedCategoryId
                          ? 'font-medium text-foreground'
                          : 'hover:text-foreground',
                      )}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))
              )}
            </nav>

            <span className="text-[11px] text-muted-foreground tabular-nums">
              {stats.categoryCount} 文件夹 · {stats.bookmarkCount} 书签
            </span>
          </div>

          {error && !loading ? (
            <EmptyState title="加载失败" body={error} icon={<Globe size={24} />} />
          ) : null}

          {bookmarksError && !loading ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-foreground">
              {bookmarksError}
            </div>
          ) : null}

          {loading ? <LoadingState /> : null}

          {!loading && !error ? (
            <section className="flex flex-col gap-3">
              <div>
                <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                  {sectionTitle}
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">{sectionMeta}</p>
              </div>

              {visibleBookmarksLoading ? (
                <LoadingState />
              ) : visibleBookmarks.length === 0 ? (
                <EmptyState
                  title={
                    isSearching
                      ? '没有匹配结果'
                      : showPinned
                        ? '首页还没有收藏'
                        : '这个文件夹还是空的'
                  }
                  body={
                    isSearching
                      ? '试试更短的关键词，或换个说法。'
                      : showPinned
                        ? '点书签上的星标，就会出现在首页。'
                        : '放进第一枚书签，开始整理这个文件夹。'
                  }
                  icon={<BookmarkIcon size={24} />}
                  action={
                    !isSearching ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setBookmarkEditor({ mode: 'create' })}
                      >
                        <Plus data-icon="inline-start" />
                        添加书签
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <div
                  className={
                    viewMode === 'grid'
                      ? 'grid w-full min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3'
                      : 'flex w-full min-w-0 flex-col gap-1.5'
                  }
                >
                  {visibleBookmarks.map((bookmark) => (
                    <BookmarkCard
                      key={bookmark.id}
                      bookmark={bookmark}
                      viewMode={viewMode}
                      categoryLabel={
                        isSearching ? categoryLookup.get(bookmark.categoryId) : undefined
                      }
                      onEdit={handleEditBookmark}
                      onDelete={handleDeleteBookmark}
                      onTogglePin={handleTogglePin}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </AppShell>

      <Toaster />

      <Suspense fallback={null}>
        {bookmarkEditor ? (
          <BookmarkForm
            open
            categories={categories}
            bookmark={bookmarkEditor.bookmark}
            selectedCategoryId={showPinned ? null : selectedCategoryId}
            onClose={() => setBookmarkEditor(null)}
            onSubmit={(input) => saveBookmark(input, bookmarkEditor.bookmark)}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {categoryEditor ? (
          <CategoryForm
            open
            categories={categories}
            category={categoryEditor.category}
            onClose={() => setCategoryEditor(null)}
            onSubmit={(input) => saveCategory(input, categoryEditor.category?.id)}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {transferOpen ? (
          <ImportExportPanel
            open
            onClose={() => setTransferOpen(false)}
            onImported={async () => {
              await loadCategories({ quiet: true, refreshBookmarks: true });
              pushToast('导入完成', 'success');
            }}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {settingsOpen ? <SettingsPanel open onClose={() => setSettingsOpen(false)} /> : null}
      </Suspense>

      <Suspense fallback={null}>
        {confirm ? (
          <ConfirmDialog
            open
            title={confirm.title}
            body={confirm.body}
            loading={confirmLoading}
            confirmLabel="删除"
            onConfirm={() => void runConfirm()}
            onClose={() => setConfirm(null)}
          />
        ) : null}
      </Suspense>
    </>
  );
}
