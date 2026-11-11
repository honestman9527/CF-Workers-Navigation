import type { Bookmark, BookmarkInput } from '@shared/api/types';

import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Globe,
  Inbox,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  Sun,
  X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { canFocusSearch, isComposingKey } from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { useBookmarkMutations } from '@nav/features/bookmarks/useBookmarkMutations';
import { categoryIcon } from '@nav/features/categories/icons';
import { buildCategoryTree, descendantTotals } from '@nav/features/categories/tree';
import { BrandIcon } from '@nav/features/layout/BrandIcon';
import { retainSelectedOption, tagOptions } from '@nav/features/selection/options';
import { useApiData } from '@nav/hooks/useApiData';
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

import { createBookmarkFeedCache } from './bookmarkFeedCache';
import { BookmarkSection, FeedContent, type BookmarkActions } from './BookmarkSection';
import { FrontButton } from './controls';
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
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [composing, setComposing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [pinnedVersion, setPinnedVersion] = useState(0);
  const [feedCache] = useState(createBookmarkFeedCache);
  const [editor, setEditor] = useState<Bookmark | 'new' | null>(null);
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
  useBackground(settings);
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
    query: search.q,
    tag: search.tag,
    untagged: search.untagged,
    enabled: searching,
    version,
    onUnauthorized: unauthorized,
  });

  useEffect(() => {
    document.title = '书签柜';
  }, []);
  useEffect(() => {
    setDraft(search.q ?? '');
    setHighlighted(-1);
  }, [search.q, search.tag, search.untagged, mode]);
  useEffect(() => {
    if (composing || draft.trim() === (search.q ?? '')) return;
    const timer = window.setTimeout(() => {
      void update((prev) => ({ ...prev, mode, q: draft.trim() || undefined }), true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, search.q, mode, update, composing]);
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (canFocusSearch(event)) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', focus);
    return () => window.removeEventListener('keydown', focus);
  }, []);
  function selectCategory(category: string) {
    setDraft('');
    void browse.selectCategory(category);
  }
  function locateSection(rootSlug?: string) {
    setDraft('');
    void browse.locateSection(rootSlug);
  }
  function selectMode(next: SearchMode) {
    update({ ...search, mode: next, q: draft.trim() || undefined });
  }
  function clearSearch() {
    setDraft('');
    update({ ...search, mode, q: undefined, tag: undefined, untagged: undefined }, true);
  }

  const mutations = useBookmarkMutations({
    onContentChange(change) {
      if (change.kind === 'pinned' || change.kind === 'created' || change.kind === 'updated') {
        const saved = change.bookmark;
        feedCache.apply(saved);
        if (change.kind === 'pinned') setPinnedVersion((value) => value + 1);
        else setVersion((value) => value + 1);
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
      }
    },
    onError(message) {
      if (alive.current) setNotice(message);
    },
  });
  async function saveBookmark(value: BookmarkInput) {
    await mutations.save(value, editor && editor !== 'new' ? editor.id : undefined);
  }
  const actions: BookmarkActions = {
    authed: auth.authed,
    pendingIds: mutations.pendingIds,
    cache: feedCache,
    onEdit: setEditor,
    onPin: (bookmark) => {
      void mutations.togglePin(bookmark);
    },
  };
  const targetAvailable =
    mode === 'site'
      ? Boolean(draft.trim() || search.tag || search.untagged)
      : Boolean(bang.query && (engine || (!bang.engineId && looksLikeUrl(draft))));
  function submitSearch() {
    if (composing) return;
    if (mode === 'site') {
      if (draft.trim() === (search.q ?? '') && highlighted >= 0 && results.items[highlighted]) {
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

  return (
    <div className="front-surface min-h-dvh pb-[max(2rem,env(safe-area-inset-bottom))] text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:pb-0">
      <aside className="border-b border-border/45 bg-card/65 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[248px] lg:flex-col lg:justify-between lg:border-r lg:border-b-0 lg:px-4 lg:py-5 dark:bg-card/45">
        <div className="flex min-h-0 flex-col lg:flex-1">
          <div className="flex h-16 items-center justify-between gap-2 px-4 sm:px-6 lg:h-auto lg:px-2 lg:pb-5">
            <Link
              to="/"
              search={{}}
              className="flex min-w-0 items-center gap-3 rounded-xl text-foreground"
            >
              <BrandIcon className="size-9 shrink-0" />
              <div className="min-w-0">
                <strong className="block truncate font-display text-base font-semibold">
                  书签柜
                </strong>
                <span className="block truncate text-xs text-muted-foreground">网站导航与整理</span>
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
              {auth.authed ? (
                <FrontButton
                  tone="subtle"
                  onClick={() => setEditor('new')}
                  className="min-h-10 px-3 text-primary"
                >
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">添加书签</span>
                  <span className="sr-only sm:hidden">添加书签</span>
                </FrontButton>
              ) : null}
              <NavigationMenu
                theme={theme}
                setTheme={setTheme}
                authed={auth.authed}
                loggingOut={loggingOut}
                onLogout={() => void logout()}
                onAdmin={() => void navigate({ to: '/admin' })}
                onLogin={() =>
                  void navigate({
                    to: '/login',
                    search: { redirect: window.location.pathname + window.location.search },
                  })
                }
              />
            </div>
          </div>
          <nav
            aria-label="分类导航"
            className="border-t border-border/40 px-3 py-2 sm:px-6 lg:flex-1 lg:overflow-y-auto lg:border-t-0 lg:px-0 lg:py-0"
          >
            <div className="mb-2 hidden px-2.5 text-xs font-medium text-muted-foreground lg:block">
              分类工作台
            </div>
            <div className="flex gap-1.5 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-x-visible">
              <FrontButton
                onClick={() => locateSection()}
                className={cn(
                  'min-h-10 justify-start gap-2.5 px-3 whitespace-nowrap lg:w-full',
                  !search.category && !searching
                    ? 'bg-primary/12 font-semibold text-primary hover:bg-primary/15'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                )}
              >
                <Star aria-hidden="true" className="size-4 shrink-0" />
                常用
              </FrontButton>
              {roots.map((root) => {
                const Icon = categoryIcon(root.icon);
                const isActive = browse.activeRoot === root.slug;
                const count = totals.get(root.id) ?? root.bookmarkCount ?? 0;
                return (
                  <FrontButton
                    key={root.id}
                    aria-current={isActive ? 'location' : undefined}
                    onClick={() => locateSection(root.slug)}
                    data-count={count > 0 ? count : undefined}
                    className={cn(
                      'min-h-10 justify-start gap-2.5 px-3 whitespace-nowrap lg:w-full lg:after:ml-auto lg:after:text-xs lg:after:font-normal lg:after:text-muted-foreground lg:after:tabular-nums lg:after:content-[attr(data-count)]',
                      isActive
                        ? 'bg-primary/12 font-semibold text-primary hover:bg-primary/15'
                        : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className="truncate">{root.name}</span>
                  </FrontButton>
                );
              })}
              <FrontButton
                onClick={() => locateSection('uncategorized')}
                aria-current={search.category === 'uncategorized' ? 'location' : undefined}
                className={cn(
                  'min-h-10 justify-start gap-2.5 px-3 whitespace-nowrap lg:w-full',
                  search.category === 'uncategorized'
                    ? 'bg-primary/12 font-semibold text-primary hover:bg-primary/15'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                )}
              >
                <Inbox aria-hidden="true" className="size-4 shrink-0" />
                未分类
              </FrontButton>
            </div>
          </nav>
        </div>
        <div className="hidden lg:flex lg:flex-col lg:gap-2 lg:border-t lg:border-border/45 lg:pt-3.5">
          <div
            role="group"
            aria-label="主题设置"
            className="grid grid-cols-3 gap-1 rounded-xl bg-secondary/75 p-1"
          >
            {(
              [
                { value: 'light', label: '亮色', shortLabel: '亮色', icon: Sun },
                { value: 'dark', label: '暗色', shortLabel: '暗色', icon: Moon },
                { value: 'system', label: '跟随系统', shortLabel: '系统', icon: Settings2 },
              ] as const
            ).map(({ value, label, shortLabel, icon: Icon }) => (
              <FrontButton
                key={value}
                aria-pressed={theme === value}
                aria-label={label}
                title={label}
                onClick={() => setTheme(value)}
                className={cn(
                  'min-h-8 gap-1.5 rounded-lg px-2 py-1 text-xs',
                  theme === value
                    ? 'bg-card font-semibold text-foreground'
                    : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span>{shortLabel}</span>
              </FrontButton>
            ))}
          </div>
          {auth.authed ? (
            <div className="grid grid-cols-2 gap-1.5">
              <FrontButton
                tone="subtle"
                onClick={() => void navigate({ to: '/admin' })}
                className="min-h-9 justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium"
              >
                <LayoutDashboard className="size-3.5 shrink-0" />
                <span>管理后台</span>
              </FrontButton>
              <FrontButton
                tone="subtle"
                disabled={loggingOut}
                onClick={() => void logout()}
                className="min-h-9 justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted-foreground hover:border-destructive/40 hover:text-destructive"
              >
                <LogOut className="size-3.5 shrink-0" />
                <span>{loggingOut ? '退出中…' : '退出登录'}</span>
              </FrontButton>
            </div>
          ) : (
            <FrontButton
              tone="subtle"
              onClick={() =>
                void navigate({
                  to: '/login',
                  search: { redirect: window.location.pathname + window.location.search },
                })
              }
              className="min-h-9 w-full justify-center gap-2 rounded-xl px-3 text-xs font-medium"
            >
              <LogIn className="size-3.5 shrink-0" />
              <span>管理员登录</span>
            </FrontButton>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col justify-between px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <main className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                书签柜网站导航
              </h1>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums sm:text-sm">
                常用直达与多级分类工作台 · {roots.length} 个一级分类 · {tags.data?.length ?? 0}{' '}
                个标签
              </p>
            </div>
            {auth.authed ? (
              <FrontButton
                tone="primary"
                onClick={() => setEditor('new')}
                className="hidden min-h-10 px-4 lg:inline-flex"
              >
                <Plus className="size-4" />
                添加书签
              </FrontButton>
            ) : null}
          </div>
          {settingsError ? (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
            >
              <span className="text-destructive">设置加载失败：{settingsError}</span>
              <FrontButton disabled={settingsLoading} onClick={retrySettings}>
                {settingsLoading ? '正在重试…' : '重试设置'}
              </FrontButton>
            </div>
          ) : settingsLoading && !settings ? (
            <p role="status" className="mb-5 py-2 text-sm text-muted-foreground">
              正在加载设置…
            </p>
          ) : null}
          <section
            aria-label="搜索"
            className="mb-6 rounded-2xl border border-border/45 bg-card/80 p-4 sm:p-6 dark:bg-card/55"
          >
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
              <div
                role="group"
                aria-label="搜索模式"
                className="inline-flex rounded-xl bg-secondary/75 p-1"
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
                      mode === value && 'bg-card font-semibold text-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </FrontButton>
                ))}
              </div>
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                <span>按</span>
                <kbd className="rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  /
                </kbd>
                <span>
                  {mode === 'site'
                    ? '快速检索标题、网址、描述与标签'
                    : '输入关键词搜索网页或直达网址'}
                </span>
              </span>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
              className="flex min-h-13 items-center gap-2 rounded-xl border border-border/60 bg-background px-3.5 py-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 sm:min-h-14 sm:px-4"
            >
              <Search className="size-5 shrink-0 text-muted-foreground" />
              <input
                ref={input}
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
                    mode === 'site' &&
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
                  className="size-10 rounded-lg p-0"
                  aria-label="清除搜索"
                  onClick={clearSearch}
                >
                  <X className="size-4" />
                </FrontButton>
              ) : null}
              <FrontButton
                type="submit"
                tone="primary"
                disabled={!targetAvailable}
                className="size-10 rounded-lg p-0"
                aria-label={mode === 'site' ? '搜索站内' : '搜索网页'}
              >
                <ArrowRight className="size-5" />
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
                    className="min-h-9 max-w-48 rounded-lg border border-border/50 bg-background px-3 text-xs font-medium text-foreground outline-none focus:border-primary sm:text-sm"
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
                    <span className="rounded-lg bg-primary/12 px-2.5 py-1 text-xs font-medium text-primary">
                      本次使用 {engine?.name}
                    </span>
                  ) : null}
                </div>
              ) : (
                <details
                  className="w-full"
                  onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
                >
                  <summary className="inline-flex min-h-9 w-fit cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/70 hover:text-foreground sm:text-sm">
                    <SlidersHorizontal className="size-3.5" />
                    筛选{search.tag || search.untagged ? ' · 已启用' : ''}
                  </summary>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-xl bg-secondary/45 p-3">
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
          </section>
          {searching ? (
            <section
              aria-label="站内搜索结果"
              className="mb-6 rounded-2xl border border-border/45 bg-card/80 p-5 sm:p-6 dark:bg-card/55"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                  {search.q ? `搜索“${search.q}”` : search.untagged ? '无标签书签' : '标签筛选'}
                </h2>
                <FrontButton tone="subtle" onClick={clearSearch}>
                  清除搜索与筛选
                </FrontButton>
              </div>
              <FeedContent
                feed={results}
                actions={actions}
                highlighted={highlighted}
                emptyMessage="没有找到匹配的网站，请调整关键词或筛选。"
              />
            </section>
          ) : null}
          <div hidden={searching} className="space-y-5">
            {categories.error ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                {categories.error}
                <FrontButton onClick={categories.refresh}>重试分类</FrontButton>
              </div>
            ) : null}
            <BookmarkSection
              pinned
              selectedSlug={search.category}
              actions={actions}
              version={version + pinnedVersion}
              onSelect={selectCategory}
              onUnauthorized={unauthorized}
            />
            {roots.map((root) => (
              <BookmarkSection
                key={root.id}
                root={root}
                selectedSlug={browse.selections[root.slug]}
                active={browse.activeRoot === root.slug}
                actions={actions}
                version={version}
                onSelect={selectCategory}
                onUnauthorized={unauthorized}
              />
            ))}
            {categories.loading && !categories.data ? (
              <p role="status" className="py-6 text-center text-sm text-muted-foreground">
                正在加载分类…
              </p>
            ) : null}
            <BookmarkSection
              active={search.category === 'uncategorized'}
              selectedSlug={search.category}
              actions={actions}
              version={version}
              onSelect={selectCategory}
              onUnauthorized={unauthorized}
            />
          </div>
        </main>
        <footer className="mt-8 border-t border-border/40 pt-4 text-xs text-muted-foreground">
          书签柜
        </footer>
      </div>
      {notice ? (
        <div
          role="status"
          className="fixed right-4 bottom-4 left-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-4 rounded-2xl border border-border/60 bg-popover py-2 pr-1 pl-5 text-sm text-popover-foreground"
        >
          <span>{notice}</span>
          <FrontButton aria-label="关闭提示" onClick={() => setNotice('')} className="size-11 p-0">
            <X className="size-4" />
          </FrontButton>
        </div>
      ) : null}
      {auth.authed && editor ? (
        <Suspense
          fallback={
            <p role="status" className="fixed right-4 bottom-4 z-50 rounded-xl bg-card p-4 text-sm">
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
    </div>
  );
}
