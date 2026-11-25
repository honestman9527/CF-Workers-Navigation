import type { Bookmark, BookmarkInput } from '@shared/api/types';

import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  ChevronDown,
  Command,
  Globe,
  LayoutDashboard,
  LayoutGrid,
  List,
  LogIn,
  LogOut,
  Menu as MenuIcon,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  canFocusSearch,
  isCommandPaletteShortcut,
  isComposingKey,
  isSidebarToggleShortcut,
} from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import { runViewTransition } from '@/lib/viewTransition';
import { api } from '@nav/api/client';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { useBookmarkMutations } from '@nav/features/bookmarks/useBookmarkMutations';
import { buildCategoryTree, descendantTotals } from '@nav/features/categories/tree';
import { BrandIcon } from '@nav/features/layout/BrandIcon';
import { retainSelectedOption, tagOptions } from '@nav/features/selection/options';
import { useApiData } from '@nav/hooks/useApiData';
import { useAppearance } from '@nav/hooks/useAppearance';
import { useBackground } from '@nav/hooks/useBackground';
import { useSettings } from '@nav/hooks/useSettings';
import { useTheme } from '@nav/hooks/useTheme';
import {
  buildSearchUrl,
  DEFAULT_SEARCH_ENGINES,
  looksLikeUrl,
  normalizeNavigateUrl,
  parseBangQuery,
} from '@shared/search';

import { AppearancePopover } from './AppearancePopover';
import { createBookmarkFeedCache } from './bookmarkFeedCache';
import { BookmarkSection, type BookmarkActions } from './BookmarkSection';
import { CategoryGroups } from './CategoryGroups';
import { CategoryNavTree } from './CategoryNavTree';
import { CommandPalette } from './CommandPalette';
import { FrontButton } from './controls';
import { FrontCategoryDrawer } from './FrontCategoryDrawer';
import { FrontDialog } from './FrontDialog';
import { FrontTooltip, FrontTooltipProvider } from './FrontTooltip';
import { NavigationMenu } from './NavigationMenu';
import { type SearchMode } from './search';
import { useBookmarkFeed } from './useBookmarkFeed';
import { useCategoryBrowse } from './useCategoryBrowse';

const FrontBookmarkEditor = lazy(() =>
  import('./FrontBookmarkEditor').then((module) => ({ default: module.FrontBookmarkEditor })),
);
const FrontSearchSelect = lazy(() =>
  import('./FrontSearchSelect').then((module) => ({ default: module.FrontSearchSelect })),
);
const openLink = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

/** 认证身份变化时立即卸载全部列表、索引与编辑草稿。 */
export function NavigationPage() {
  const auth = useAuthContext();
  return <NavigationSurface key={auth.authed ? 'admin' : 'public'} />;
}

function NavigationSurface() {
  const auth = useAuthContext();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const {
    palette,
    setPalette,
    density,
    setDensity,
    bgOverlayOpacity,
    setBgOverlayOpacity,
    frontSidebarOpen: sidebarOpen,
    setFrontSidebarOpen: setSidebarOpen,
  } = useAppearance();
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, [setSidebarOpen]);
  const navigate = useNavigate();
  const [composing, setComposing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [pinnedVersion, setPinnedVersion] = useState(0);
  const [feedCache] = useState(createBookmarkFeedCache);
  const [editor, setEditor] = useState<Bookmark | 'new' | null>(null);
  const [pendingTrash, setPendingTrash] = useState<Bookmark | null>(null);
  const [notice, setNotice] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [highlighted, setHighlighted] = useState(-1);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const logout = useCallback(async () => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    try {
      await auth.logout();
    } catch {
      if (alive.current) setNotice('退出登录失败，请重试');
    } finally {
      logoutPending.current = false;
      if (alive.current) setLoggingOut(false);
    }
  }, [auth]);
  const unauthorized = useCallback(() => {
    void logout();
  }, [logout]);
  const {
    settings,
    loading: settingsLoading,
    error: settingsError,
    retry: retrySettings,
  } = useSettings(unauthorized);
  const hasBackground = Boolean(
    settings?.backgroundImageEnabled && settings.backgroundImageUrl.trim(),
  );
  useBackground(settings, bgOverlayOpacity);
  const loadCategories = useCallback((signal: AbortSignal) => api.getCategories(signal), []);
  const loadTags = useCallback((signal: AbortSignal) => api.getTags(signal), []);
  const categories = useApiData(loadCategories, { onUnauthorized: unauthorized });
  const tags = useApiData(loadTags, { onUnauthorized: unauthorized });
  const tagsForSelect = useMemo(
    () => [
      { value: '', label: '全部标签' },
      { value: '__untagged__', label: '无标签' },
      ...tagOptions(tags.data ?? []),
    ],
    [tags.data],
  );
  const roots = useMemo(() => buildCategoryTree(categories.data ?? []), [categories.data]);
  const totals = useMemo(() => descendantTotals(categories.data ?? []), [categories.data]);
  const browse = useCategoryBrowse(roots, Boolean(categories.data));
  const { search, mode, searching, update } = browse;
  const [draft, setDraft] = useState(search.q ?? '');
  const engines = settings?.searchEngines.length ? settings.searchEngines : DEFAULT_SEARCH_ENGINES;
  const engineId = search.engine ?? settings?.defaultEngineId ?? engines[0]?.id;
  const bang = parseBangQuery(draft, engines);
  const engine = engines.find((item) => item.id === (bang.engineId ?? engineId));
  const results = useBookmarkFeed({
    coordinator: feedCache,
    query: searching ? search.q : undefined,
    tag: searching ? search.tag : undefined,
    untagged: searching ? search.untagged : undefined,
    category: search.category,
    pinned: !searching && !search.category ? true : undefined,
    cacheVisited: true,
    pinnedVersion,
    enabled:
      (!browse.root || searching) &&
      (!search.category || search.category === 'uncategorized' || Boolean(categories.data)) &&
      !browse.invalidCategory,
    version,
    onUnauthorized: unauthorized,
  });

  // 汇总当前已加载/缓存的书签，供命令面板默认展示。
  const recentBookmarks = useMemo(() => {
    const map = new Map<number, Bookmark>();
    for (const item of results.items) map.set(item.id, item);
    for (const snapshot of feedCache.snapshots.values()) {
      for (const item of snapshot.items) {
        if (!map.has(item.id)) map.set(item.id, item);
      }
    }
    return [...map.values()];
  }, [results.items, feedCache.snapshots]);

  const effectiveResolvedTheme = resolvedTheme ?? (theme === 'dark' ? 'dark' : 'light');

  const currentScopeLabel =
    browse.root?.name ?? (search.category === 'uncategorized' ? '未分类' : '常用');

  useEffect(() => {
    document.title = searching
      ? '站内搜索 · 书签柜'
      : currentScopeLabel !== '常用'
        ? `${currentScopeLabel} · 书签柜`
        : '书签柜';
  }, [searching, currentScopeLabel]);
  useEffect(() => {
    setDraft(search.q ?? '');
    setHighlighted(-1);
  }, [search.q, search.tag, search.untagged, search.category, mode]);
  useEffect(() => {
    if (composing || draft.trim() === (search.q ?? '')) return;
    const timer = window.setTimeout(() => {
      void update((prev) => ({ ...prev, mode, q: draft.trim() || undefined }), true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, search.q, mode, update, composing]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isCommandPaletteShortcut(event)) {
        if (editor !== null || pendingTrash !== null) return;
        event.preventDefault();
        setCommandOpen((prev) => !prev);
        return;
      }
      if (isSidebarToggleShortcut(event)) {
        if (editor !== null || pendingTrash !== null || commandOpen || drawerOpen) return;
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (!commandOpen && !drawerOpen && canFocusSearch(event)) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor, pendingTrash, commandOpen, drawerOpen, toggleSidebar]);

  function selectCategory(category?: string) {
    void browse.selectCategory(category, draft);
  }
  function selectMode(next: SearchMode) {
    runViewTransition(
      () => {
        void update({ ...search, mode: next, q: draft.trim() || undefined });
      },
      { kind: 'fade' },
    );
  }
  function clearSearch() {
    setDraft('');
    update({ ...search, mode, q: undefined, tag: undefined, untagged: undefined }, true);
  }
  function selectTagByName(tagName: string) {
    const matched = tags.data?.find(
      (item) =>
        item.slug.toLocaleLowerCase() === tagName.toLocaleLowerCase() ||
        item.name.toLocaleLowerCase() === tagName.toLocaleLowerCase(),
    );
    const nextTag = matched?.slug ?? tagName;
    void update({
      ...search,
      mode: 'site',
      q: draft.trim() || undefined,
      tag: nextTag,
      untagged: undefined,
    });
  }

  const mutations = useBookmarkMutations({
    onContentChange(change) {
      if (change.kind === 'pinned' || change.kind === 'created' || change.kind === 'updated') {
        const saved = change.bookmark;
        feedCache.apply(saved);
        if (change.kind === 'pinned') setPinnedVersion((value) => value + 1);
        else setVersion((value) => value + 1);
      } else if (change.kind === 'trashed' || change.kind === 'deleted') {
        setVersion((value) => value + 1);
      }
    },
    invalidateTags: tags.refresh,
    invalidateCategories: categories.refresh,
    onSuccess(change) {
      if (!alive.current) return;
      if (change.kind === 'pinned') {
        setNotice(change.bookmark.isPinned ? '已加入常用' : '已取消常用');
      } else if (change.kind === 'created' || change.kind === 'updated') {
        setEditor(null);
        setNotice('书签已保存');
      } else if (change.kind === 'trashed') {
        setPendingTrash(null);
        setNotice('已移入回收站，可在后台恢复');
      }
    },
    onError(message) {
      if (alive.current) setNotice(message);
    },
  });
  async function saveBookmark(value: BookmarkInput) {
    await mutations.save(value, editor && editor !== 'new' ? editor.id : undefined);
  }
  async function confirmTrashBookmark() {
    if (!pendingTrash) return;
    await mutations.changeState(pendingTrash.id, 'trash');
  }
  const actions: BookmarkActions = {
    authed: auth.authed,
    density,
    pendingIds: mutations.pendingIds,
    cache: feedCache,
    onEdit: setEditor,
    onPin: (bookmark) => {
      void mutations.togglePin(bookmark);
    },
    onDelete: (bookmark) => setPendingTrash(bookmark),
    onSelectTag: selectTagByName,
    onSelectCategory: (slug) => selectCategory(slug),
  };
  const targetAvailable =
    mode === 'site'
      ? Boolean(draft.trim() || search.tag || search.untagged)
      : Boolean(bang.query && (engine || (!bang.engineId && looksLikeUrl(draft))));
  function submitSearch() {
    if (composing) return;
    if (mode === 'site') {
      if (
        searching &&
        draft.trim() === (search.q ?? '') &&
        highlighted >= 0 &&
        results.items[highlighted]
      ) {
        openLink(results.items[highlighted].url);
        return;
      }
      update({ ...search, mode, q: draft.trim() || undefined }, true);
      return;
    }
    if (!bang.engineId && looksLikeUrl(draft)) {
      openLink(normalizeNavigateUrl(draft));
      return;
    }
    if (bang.query && engine) openLink(buildSearchUrl(engine, bang.query));
  }

  const goLogin = useCallback(() => {
    void navigate({
      to: '/login',
      search: { redirect: window.location.pathname + window.location.search },
      viewTransition: true,
    });
  }, [navigate]);
  const goAdmin = useCallback(() => {
    void navigate({ to: '/admin', viewTransition: true });
  }, [navigate]);

  return (
    <div
      data-sidebar-state={sidebarOpen ? 'expanded' : 'collapsed'}
      className={cn(
        'front-surface min-h-dvh pb-[max(2rem,env(safe-area-inset-bottom))] text-foreground lg:grid lg:pb-0 motion-safe:lg:transition-[grid-template-columns] motion-safe:lg:duration-200',
        sidebarOpen ? 'lg:grid-cols-[264px_minmax(0,1fr)]' : 'lg:grid-cols-[72px_minmax(0,1fr)]',
      )}
    >
      <div aria-hidden="true" className="scroll-progress-bar" />
      <a href="#front-main" className="skip-link">
        跳至主内容
      </a>
      {/* 移动端 / 平板端吸顶顶栏（< lg）：左侧打开分类抽屉，替代原横向滚动分类条 */}
      <header className="glass-surface sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-5 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <FrontButton
            aria-label="打开分类导航"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="size-11 p-0"
          >
            <MenuIcon aria-hidden="true" className="size-5" />
          </FrontButton>
          <Link
            to="/"
            search={{}}
            className="flex min-w-0 items-center gap-2.5 rounded-xl text-foreground"
          >
            <BrandIcon className="size-8 shrink-0" />
            <div className="min-w-0">
              <strong className="block truncate font-display text-sm font-semibold">书签柜</strong>
              <span className="block truncate text-[0.6875rem] text-muted-foreground">
                {currentScopeLabel}
              </span>
            </div>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <FrontButton
            aria-label="打开命令面板"
            title="命令面板 (Cmd/Ctrl + K)"
            onClick={() => setCommandOpen(true)}
            className="size-10 p-0"
          >
            <Command aria-hidden="true" className="size-4" />
          </FrontButton>
          <AppearancePopover
            theme={theme}
            resolvedTheme={effectiveResolvedTheme}
            setTheme={setTheme}
            palette={palette}
            setPalette={setPalette}
            density={density}
            setDensity={setDensity}
            bgOverlayOpacity={bgOverlayOpacity}
            setBgOverlayOpacity={setBgOverlayOpacity}
            hasBackground={hasBackground}
            side="bottom"
            align="end"
            compactTrigger
          />
          {auth.authed ? (
            <FrontButton
              tone="subtle"
              onClick={() => setEditor('new')}
              className="size-10 min-h-10 p-0 text-primary sm:w-auto sm:px-3"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">添加书签</span>
              <span className="sr-only sm:hidden">添加书签</span>
            </FrontButton>
          ) : null}
          <NavigationMenu
            theme={theme}
            resolvedTheme={effectiveResolvedTheme}
            setTheme={setTheme}
            palette={palette}
            setPalette={setPalette}
            authed={auth.authed}
            loggingOut={loggingOut}
            onLogout={() => void logout()}
            onAdmin={goAdmin}
            onLogin={goLogin}
          />
        </div>
      </header>

      {/* 桌面端可折叠左侧边栏（>= lg）：支持展开完整两级树与折叠紧凑图标栏（Icon Rail） */}
      <FrontTooltipProvider>
        <aside
          id="front-sidebar"
          data-state={sidebarOpen ? 'expanded' : 'collapsed'}
          className={cn(
            'glass-surface hidden border-r border-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between motion-safe:lg:transition-[width,padding] motion-safe:lg:duration-200',
            sidebarOpen
              ? 'lg:w-[264px] lg:px-4 lg:py-5'
              : 'lg:w-[72px] lg:items-center lg:px-2 lg:py-4',
          )}
        >
          <div
            className={cn(
              'flex min-h-0 w-full flex-1 flex-col',
              sidebarOpen ? 'gap-4' : 'items-center gap-3',
            )}
          >
            <div
              className={cn(
                'flex w-full items-center gap-2',
                sidebarOpen ? 'justify-between' : 'flex-col',
              )}
            >
              <FrontTooltip enabled={!sidebarOpen} content="书签柜首页">
                <Link
                  to="/"
                  search={{}}
                  aria-label={sidebarOpen ? undefined : '书签柜首页'}
                  className={cn(
                    'flex min-w-0 items-center rounded-xl text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
                    sidebarOpen ? 'gap-3 px-2' : 'grid size-11 place-items-center',
                  )}
                >
                  <BrandIcon className="size-9 shrink-0" />
                  {sidebarOpen ? (
                    <div className="min-w-0">
                      <strong className="block truncate font-display text-base font-semibold">
                        书签柜
                      </strong>
                      <span className="block truncate text-xs text-muted-foreground">
                        网站导航与整理
                      </span>
                    </div>
                  ) : null}
                </Link>
              </FrontTooltip>

              <FrontTooltip
                enabled={!sidebarOpen}
                content={sidebarOpen ? '收起为图标栏 (⌘B / Ctrl+B)' : '展开侧边栏 (⌘B / Ctrl+B)'}
              >
                <FrontButton
                  aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
                  aria-expanded={sidebarOpen}
                  aria-controls="front-sidebar"
                  title={sidebarOpen ? '收起为图标栏 (⌘B / Ctrl+B)' : '展开侧边栏 (⌘B / Ctrl+B)'}
                  onClick={toggleSidebar}
                  className={cn('rounded-xl p-0', sidebarOpen ? 'size-9 min-h-9' : 'size-11')}
                >
                  {sidebarOpen ? (
                    <PanelLeftClose aria-hidden="true" className="size-4" />
                  ) : (
                    <PanelLeftOpen aria-hidden="true" className="size-4" />
                  )}
                </FrontButton>
              </FrontTooltip>
            </div>

            {sidebarOpen ? (
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                aria-label="打开命令面板"
                className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-background/70 px-3 text-xs text-muted-foreground shadow-2xs transition-colors hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
              >
                <span className="flex items-center gap-2">
                  <Search aria-hidden="true" className="size-3.5" />
                  <span>快速跳转或命令…</span>
                </span>
                <kbd className="rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                  ⌘K
                </kbd>
              </button>
            ) : (
              <FrontTooltip content="命令面板 (⌘K / Ctrl+K)">
                <FrontButton
                  tone="subtle"
                  onClick={() => setCommandOpen(true)}
                  aria-label="打开命令面板"
                  className="size-11 rounded-xl p-0"
                >
                  <Search aria-hidden="true" className="size-4" />
                </FrontButton>
              </FrontTooltip>
            )}

            <CategoryNavTree
              roots={roots}
              totals={totals}
              activeRoot={browse.activeRoot}
              selectedCategory={search.category}
              searching={searching}
              collapsed={!sidebarOpen}
              onSelectCategory={selectCategory}
            />
          </div>

          {sidebarOpen ? (
            <div className="flex w-full items-center justify-between gap-1 border-t border-border/70 pt-2.5">
              {auth.authed ? (
                <FrontButton
                  tone="quiet"
                  onClick={goAdmin}
                  aria-label="管理后台"
                  className="min-h-9 gap-2 rounded-xl px-2.5 text-xs font-medium pointer-coarse:min-h-11"
                >
                  <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
                  <span>后台</span>
                </FrontButton>
              ) : (
                <FrontButton
                  tone="quiet"
                  onClick={goLogin}
                  aria-label="管理员登录"
                  className="min-h-9 gap-2 rounded-xl px-2.5 text-xs font-medium pointer-coarse:min-h-11"
                >
                  <LogIn aria-hidden="true" className="size-4 shrink-0" />
                  <span>登录</span>
                </FrontButton>
              )}

              <div className="flex items-center gap-0.5">
                <FrontTooltip
                  side="top"
                  sideOffset={8}
                  content={effectiveResolvedTheme === 'dark' ? '切换亮色' : '切换暗色'}
                >
                  <FrontButton
                    tone="quiet"
                    aria-label={effectiveResolvedTheme === 'dark' ? '切换亮色模式' : '切换暗色模式'}
                    onClick={(event) =>
                      runViewTransition(
                        () => setTheme(effectiveResolvedTheme === 'dark' ? 'light' : 'dark'),
                        { kind: 'ripple', origin: event.currentTarget },
                      )
                    }
                    className="size-9 min-h-9 rounded-xl p-0 pointer-coarse:size-11"
                  >
                    {effectiveResolvedTheme === 'dark' ? (
                      <Sun key="dark" aria-hidden="true" className="theme-icon-pop size-4" />
                    ) : (
                      <Moon key="light" aria-hidden="true" className="theme-icon-pop size-4" />
                    )}
                  </FrontButton>
                </FrontTooltip>

                <AppearancePopover
                  theme={theme}
                  resolvedTheme={effectiveResolvedTheme}
                  setTheme={setTheme}
                  palette={palette}
                  setPalette={setPalette}
                  density={density}
                  setDensity={setDensity}
                  bgOverlayOpacity={bgOverlayOpacity}
                  setBgOverlayOpacity={setBgOverlayOpacity}
                  hasBackground={hasBackground}
                  side="top"
                  align="end"
                  compactTrigger
                  showTooltip
                  tooltipSide="top"
                  tooltipOffset={8}
                  triggerClassName="size-9 min-h-9 rounded-xl pointer-coarse:size-11"
                />

                {auth.authed ? (
                  <FrontTooltip
                    side="top"
                    sideOffset={8}
                    content={loggingOut ? '退出中…' : '退出登录'}
                  >
                    <FrontButton
                      tone="quiet"
                      aria-label="退出登录"
                      disabled={loggingOut}
                      onClick={() => void logout()}
                      className="size-9 min-h-9 rounded-xl p-0 text-muted-foreground hover:bg-destructive/12 hover:text-destructive pointer-coarse:size-11"
                    >
                      <LogOut aria-hidden="true" className="size-4" />
                    </FrontButton>
                  </FrontTooltip>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-1.5 border-t border-border/70 pt-2.5">
              <AppearancePopover
                theme={theme}
                resolvedTheme={effectiveResolvedTheme}
                setTheme={setTheme}
                palette={palette}
                setPalette={setPalette}
                density={density}
                setDensity={setDensity}
                bgOverlayOpacity={bgOverlayOpacity}
                setBgOverlayOpacity={setBgOverlayOpacity}
                hasBackground={hasBackground}
                side="right"
                align="end"
                compactTrigger
                showTooltip
                triggerClassName="size-11"
              />
              {auth.authed ? (
                <>
                  <FrontTooltip content="管理后台">
                    <FrontButton
                      tone="quiet"
                      aria-label="管理后台"
                      onClick={goAdmin}
                      className="size-11 rounded-xl p-0"
                    >
                      <LayoutDashboard aria-hidden="true" className="size-4" />
                    </FrontButton>
                  </FrontTooltip>
                  <FrontTooltip content={loggingOut ? '退出中…' : '退出登录'}>
                    <FrontButton
                      tone="quiet"
                      aria-label="退出登录"
                      disabled={loggingOut}
                      onClick={() => void logout()}
                      className="size-11 rounded-xl p-0 text-muted-foreground hover:bg-destructive/12 hover:text-destructive"
                    >
                      <LogOut aria-hidden="true" className="size-4" />
                    </FrontButton>
                  </FrontTooltip>
                </>
              ) : (
                <FrontTooltip content="管理员登录">
                  <FrontButton
                    tone="quiet"
                    aria-label="管理员登录"
                    onClick={goLogin}
                    className="size-11 rounded-xl p-0"
                  >
                    <LogIn aria-hidden="true" className="size-4" />
                  </FrontButton>
                </FrontTooltip>
              )}
            </div>
          )}
        </aside>
      </FrontTooltipProvider>

      <div className="flex min-w-0 flex-1 flex-col justify-between px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <main className="mx-auto w-full max-w-[90rem] min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1
                id="front-main"
                tabIndex={-1}
                className="text-xl font-semibold tracking-tight text-foreground outline-none sm:text-2xl"
              >
                书签柜网站导航
              </h1>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums sm:text-sm">
                常用直达与两层分类工作台 · {roots.length} 个一级分类 · {tags.data?.length ?? 0}{' '}
                个标签
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="书签视图密度"
                className="inline-flex rounded-xl border border-border bg-secondary/80 p-0.5"
              >
                <FrontButton
                  aria-label="舒适卡片视图"
                  aria-pressed={density === 'comfortable'}
                  title="舒适卡片"
                  onClick={() =>
                    runViewTransition(() => setDensity('comfortable'), { kind: 'fade' })
                  }
                  className={cn(
                    'min-h-9 gap-1.5 rounded-lg px-2.5 text-xs',
                    density === 'comfortable'
                      ? 'bg-card font-semibold text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
                  )}
                >
                  <LayoutGrid aria-hidden="true" className="size-3.5" />
                  <span className="hidden sm:inline">舒适</span>
                </FrontButton>
                <FrontButton
                  aria-label="紧凑网格视图"
                  aria-pressed={density === 'compact'}
                  title="紧凑网格"
                  onClick={() => runViewTransition(() => setDensity('compact'), { kind: 'fade' })}
                  className={cn(
                    'min-h-9 gap-1.5 rounded-lg px-2.5 text-xs',
                    density === 'compact'
                      ? 'bg-card font-semibold text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
                  )}
                >
                  <List aria-hidden="true" className="size-3.5" />
                  <span className="hidden sm:inline">紧凑</span>
                </FrontButton>
              </div>
              {auth.authed ? (
                <FrontButton
                  tone="primary"
                  onClick={() => setEditor('new')}
                  className="hidden min-h-10 px-4 lg:inline-flex"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  添加书签
                </FrontButton>
              ) : null}
            </div>
          </div>

          {settingsError ? (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm"
            >
              <span className="text-destructive">设置加载失败：{settingsError}</span>
              <FrontButton tone="subtle" disabled={settingsLoading} onClick={retrySettings}>
                {settingsLoading ? '正在重试…' : '重试设置'}
              </FrontButton>
            </div>
          ) : settingsLoading && !settings ? (
            <p className="mb-5 py-2 text-sm text-muted-foreground">正在加载设置…</p>
          ) : null}

          <search
            aria-label="搜索书签或网页"
            className="glass-surface mb-6 block rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6"
          >
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
              <div
                role="group"
                aria-label="搜索模式"
                className="inline-flex rounded-xl bg-secondary p-1"
              >
                {(
                  [
                    { value: 'site', label: '站内', icon: Search },
                    { value: 'web', label: '网页', icon: Globe },
                  ] as const
                ).map(({ value, label, icon: Icon }) => (
                  <FrontButton
                    key={value}
                    aria-pressed={mode === value}
                    onClick={() => selectMode(value)}
                    className={cn(
                      'min-h-9 rounded-lg px-4 text-xs sm:text-sm',
                      mode === value
                        ? 'bg-card font-semibold text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {label}
                  </FrontButton>
                ))}
              </div>
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                <span>按</span>
                <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[0.6875rem] text-foreground">
                  /
                </kbd>
                <span>
                  {mode === 'site'
                    ? '检索书签，或按 ⌘K 唤起全局命令面板'
                    : '搜索网页、!bang 或直达网址'}
                </span>
              </span>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
              className="flex min-h-13 items-center gap-2 rounded-xl border border-input bg-background/85 px-3.5 py-1.5 shadow-2xs transition-[border-color,box-shadow,background-color] focus-within:border-primary focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/25 sm:min-h-14 sm:px-4"
            >
              <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <input
                ref={input}
                type="search"
                name="q"
                enterKeyHint="search"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={draft}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
                aria-describedby="search-keyboard-help"
                maxLength={mode === 'site' ? 100 : undefined}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setHighlighted(-1);
                }}
                aria-label={mode === 'site' ? '搜索站内书签' : '搜索网页或输入网址'}
                placeholder={mode === 'site' ? '寻找一个收藏的网站' : '搜索网页，或直接输入网址'}
                className="min-w-0 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground"
                onKeyDown={(event) => {
                  if (isComposingKey(event.nativeEvent)) {
                    if (event.key === 'Enter') event.preventDefault();
                    return;
                  }
                  if (event.key === 'Escape') {
                    clearSearch();
                    return;
                  }
                  if (
                    searching &&
                    results.items.length &&
                    (event.key === 'ArrowDown' || event.key === 'ArrowUp')
                  ) {
                    event.preventDefault();
                    setHighlighted((prev) =>
                      event.key === 'ArrowDown'
                        ? (prev + 1) % results.items.length
                        : prev <= 0
                          ? results.items.length - 1
                          : prev - 1,
                    );
                  }
                }}
              />
              {draft ? (
                <FrontButton
                  className="control-enter size-10 rounded-lg p-0"
                  aria-label="清除搜索"
                  onClick={clearSearch}
                >
                  <X aria-hidden="true" className="size-4" />
                </FrontButton>
              ) : null}
              <FrontButton
                type="submit"
                tone="primary"
                disabled={!targetAvailable}
                className="size-10 rounded-lg p-0"
                aria-label={mode === 'site' ? '搜索站内' : '搜索网页'}
              >
                <ArrowRight aria-hidden="true" className="size-5" />
              </FrontButton>
            </form>
            <p id="search-keyboard-help" className="sr-only" role="status">
              {mode === 'site'
                ? `上下方向键选择结果，回车打开。${highlighted >= 0 ? `当前选择：${results.items[highlighted]?.title ?? ''}` : ''}`
                : '回车搜索网页或打开网址。'}
            </p>
            <div className="mt-3 flex min-h-10 flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              {mode === 'web' ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  <label htmlFor="search-engine" className="text-xs font-medium">
                    搜索引擎
                  </label>
                  <select
                    id="search-engine"
                    value={engineId}
                    onChange={(event) =>
                      update({
                        ...search,
                        mode,
                        engine: event.target.value,
                        q: draft.trim() || undefined,
                      })
                    }
                    className="min-h-9 max-w-48 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 sm:text-sm"
                  >
                    {!engines.some((item) => item.id === engineId) ? (
                      <option value={engineId}>原引擎已不可用，请重新选择</option>
                    ) : null}
                    {engines.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {bang.engineId ? (
                    <span className="rounded-lg border border-primary/25 bg-accent px-2.5 py-1 text-xs font-medium text-primary">
                      本次使用 {engine?.name}
                    </span>
                  ) : null}
                </div>
              ) : (
                <details
                  className="w-full"
                  onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
                >
                  <summary className="inline-flex min-h-9 w-fit cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary hover:text-foreground sm:text-sm [&::-webkit-details-marker]:hidden">
                    <SlidersHorizontal aria-hidden="true" className="size-3.5" />
                    <span>筛选{search.tag || search.untagged ? ' · 已启用' : ''}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        'size-3.5 transition-transform duration-150',
                        filtersOpen && 'rotate-180',
                      )}
                    />
                  </summary>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/55 p-3">
                    <label htmlFor="search-tag" className="text-xs font-medium">
                      标签
                    </label>
                    {filtersOpen ? (
                      <Suspense fallback={<FrontButton disabled>加载标签筛选…</FrontButton>}>
                        <FrontSearchSelect
                          id="search-tag"
                          label="标签筛选"
                          placeholder="搜索标签"
                          options={retainSelectedOption(tagsForSelect, search.tag ?? '')}
                          disabled={tags.loading && !tags.data}
                          value={search.untagged ? '__untagged__' : (search.tag ?? '')}
                          onChange={(value) =>
                            update({
                              ...search,
                              mode,
                              q: draft.trim() || undefined,
                              tag: value && value !== '__untagged__' ? value : undefined,
                              untagged: value === '__untagged__' ? true : undefined,
                            })
                          }
                          className="max-w-full sm:max-w-64"
                        />
                      </Suspense>
                    ) : null}
                    {tags.error ? (
                      <span role="alert" className="text-xs text-destructive">
                        {tags.error}
                        <FrontButton onClick={tags.refresh}>重试标签</FrontButton>
                      </span>
                    ) : null}
                  </div>
                </details>
              )}
            </div>
          </search>

          {categories.error ? (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center gap-2 text-sm text-destructive"
            >
              {categories.error}
              <FrontButton tone="subtle" onClick={categories.refresh}>
                重试分类
              </FrontButton>
            </div>
          ) : null}
          {browse.missingCategory ? (
            <p role="status" className="mb-4 text-sm text-muted-foreground">
              分类不存在或无权访问，已返回默认入口。
            </p>
          ) : null}
          {categories.loading && !categories.data ? (
            <p className="py-6 text-center text-sm text-muted-foreground">正在加载分类…</p>
          ) : null}
          {(!search.category || search.category === 'uncategorized' || categories.data) &&
          !browse.invalidCategory ? (
            browse.root && !searching ? (
              <CategoryGroups
                root={browse.root}
                selectedSlug={search.category}
                actions={actions}
                version={version}
                pinnedVersion={pinnedVersion}
                onUnauthorized={unauthorized}
              />
            ) : (
              <BookmarkSection
                root={browse.root}
                selectedSlug={search.category}
                pinned={!searching && !search.category}
                searching={searching}
                actions={actions}
                feed={results}
                highlighted={highlighted}
                onClear={clearSearch}
              />
            )
          ) : null}
        </main>
        <footer className="mx-auto mt-8 flex w-full max-w-[90rem] items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <span>书签柜</span>
          <span>按 ⌘K / Ctrl+K 快速跳转</span>
        </footer>
      </div>

      {/* 移动端 / 平板端左侧分类抽屉 */}
      <FrontCategoryDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        roots={roots}
        totals={totals}
        activeRoot={browse.activeRoot}
        selectedCategory={search.category}
        searching={searching}
        onSelectCategory={selectCategory}
        theme={theme}
        setTheme={setTheme}
        authed={auth.authed}
        loggingOut={loggingOut}
        onAdmin={goAdmin}
        onLogin={goLogin}
        onLogout={() => void logout()}
      />

      {/* 全局命令面板（Cmd/Ctrl + K） */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        roots={roots}
        totals={totals}
        recentBookmarks={recentBookmarks}
        theme={theme}
        resolvedTheme={effectiveResolvedTheme}
        setTheme={setTheme}
        palette={palette}
        setPalette={setPalette}
        density={density}
        setDensity={setDensity}
        authed={auth.authed}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onSelectCategory={selectCategory}
        onOpenBookmark={openLink}
        onCreateBookmark={() => setEditor('new')}
        onAdmin={goAdmin}
        onLogin={goLogin}
        onUnauthorized={unauthorized}
      />

      {notice ? (
        <div
          role="status"
          className="glass-surface overlay-enter fixed right-4 bottom-4 left-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-4 rounded-2xl border border-border bg-popover py-2 pr-1.5 pl-5 text-sm text-popover-foreground shadow-xl"
        >
          <span>{notice}</span>
          <FrontButton aria-label="关闭提示" onClick={() => setNotice('')} className="size-10 p-0">
            <X className="size-4" />
          </FrontButton>
        </div>
      ) : null}

      {auth.authed && editor ? (
        <Suspense
          fallback={
            <p
              role="status"
              className="glass-surface fixed right-4 bottom-4 z-50 rounded-xl border border-border bg-popover p-4 text-sm shadow-lg"
            >
              正在打开编辑器…
            </p>
          }
        >
          <FrontBookmarkEditor
            open
            bookmark={editor === 'new' ? undefined : editor}
            onClose={() => setEditor(null)}
            onSubmit={saveBookmark}
            categories={categories.data ?? []}
            tags={tags.data ?? []}
          />
        </Suspense>
      ) : null}

      {auth.authed && pendingTrash ? (
        <FrontDialog
          open
          onClose={() => setPendingTrash(null)}
          title={`移入回收站「${pendingTrash.title}」？`}
          description="书签将移入回收站，后续仍可在管理后台恢复或永久删除。"
          dismissible={!mutations.pendingIds.has(pendingTrash.id)}
          maxWidthClass="max-w-md"
        >
          <div className="flex justify-end gap-2 pt-2">
            <FrontButton
              tone="subtle"
              disabled={mutations.pendingIds.has(pendingTrash.id)}
              onClick={() => setPendingTrash(null)}
            >
              取消
            </FrontButton>
            <FrontButton
              tone="danger"
              disabled={mutations.pendingIds.has(pendingTrash.id)}
              onClick={() => void confirmTrashBookmark()}
            >
              {mutations.pendingIds.has(pendingTrash.id) ? '处理中…' : '确认移入回收站'}
            </FrontButton>
          </div>
        </FrontDialog>
      ) : null}
    </div>
  );
}
