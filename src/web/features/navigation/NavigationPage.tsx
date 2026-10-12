import type { Bookmark, BookmarkInput } from '@shared/api/types';

import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Globe, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { canFocusSearch, isComposingKey } from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { buildCategoryTree } from '@nav/features/categories/tree';
import { BrandIcon } from '@nav/features/layout/BrandIcon';
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

import { BookmarkSection, FeedContent, type BookmarkActions } from './BookmarkSection';
import { categoryPath } from './categoryBrowse';
import { FrontButton } from './controls';
import { NavigationMenu } from './NavigationMenu';
import {
  parseNavigationSearch,
  readSearchMode,
  saveSearchMode,
  type NavigationSearch,
  type SearchMode,
} from './search';
import { useBookmarkFeed } from './useBookmarkFeed';
import { useCategoryBrowse } from './useCategoryBrowse';

const FrontBookmarkEditor = lazy(() =>
  import('./FrontBookmarkEditor').then((module) => ({ default: module.FrontBookmarkEditor })),
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
  const location = useLocation();
  const search = parseNavigationSearch(location.search);
  const [preferredMode, setPreferredMode] = useState(readSearchMode);
  const mode = search.mode ?? preferredMode;
  const [draft, setDraft] = useState(search.q ?? '');
  const [composing, setComposing] = useState(false);
  const [version, setVersion] = useState(0);
  const [pinnedVersion, setPinnedVersion] = useState(0);
  const [overrides, setOverrides] = useState<Record<number, Bookmark>>({});
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const pinRequests = useRef(new Set<number>());
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
  const settings = useSettings(unauthorized);
  useBackground(settings);
  const loadCategories = useCallback(
    (signal: AbortSignal) => api.getCategories(undefined, signal),
    [],
  );
  const loadTags = useCallback((signal: AbortSignal) => api.getTags(undefined, signal), []);
  const categories = useApiData(loadCategories, { onUnauthorized: unauthorized });
  const tags = useApiData(loadTags, { onUnauthorized: unauthorized });
  const roots = useMemo(() => buildCategoryTree(categories.data ?? []), [categories.data]);
  const engines = settings?.searchEngines.length ? settings.searchEngines : DEFAULT_SEARCH_ENGINES;
  const engineId = search.engine ?? settings?.defaultEngineId ?? engines[0]?.id;
  const bang = parseBangQuery(draft, engines);
  const engine = engines.find((item) => item.id === (bang.engineId ?? engineId));
  const searching = mode === 'site' && Boolean(search.q || search.tag || search.untagged);
  const browse = useCategoryBrowse(
    location.state.__TSR_key ?? location.href,
    roots,
    search.category,
    searching,
    Boolean(categories.data),
  );
  const results = useBookmarkFeed({
    query: search.q,
    tag: search.tag,
    untagged: search.untagged,
    enabled: searching,
    version,
    onUnauthorized: unauthorized,
  });

  function update(next: NavigationSearch, replace = false) {
    browse.remember();
    return navigate({ to: '/', search: parseNavigationSearch(next), replace, resetScroll: false });
  }
  useEffect(() => {
    document.title = '书签柜';
  }, []);
  useEffect(() => {
    saveSearchMode(mode);
    setPreferredMode(mode);
  }, [mode]);
  useEffect(() => {
    setDraft(search.q ?? '');
    setHighlighted(-1);
  }, [search.q, search.tag, search.untagged, mode]);
  useEffect(() => {
    if (composing || draft.trim() === (search.q ?? '')) return;
    const timer = window.setTimeout(() => {
      browse.remember();
      void navigate({
        to: '/',
        search: (prev) => ({ ...prev, mode, q: draft.trim() || undefined }),
        replace: true,
        resetScroll: false,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, search.q, mode, navigate, composing, browse.remember]);
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
    void update({
      ...search,
      mode,
      category,
      q: undefined,
      tag: undefined,
      untagged: undefined,
    }).then(() => {
      const section = document.getElementById(
        `section-category-${categoryPath(roots, category)[0]?.slug}`,
      );
      section?.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true });
    });
  }
  function locateSection(rootSlug?: string) {
    const category =
      rootSlug === 'uncategorized'
        ? rootSlug
        : rootSlug
          ? (browse.selections[rootSlug] ?? rootSlug)
          : undefined;
    setDraft('');
    void update({
      ...search,
      mode,
      category,
      q: undefined,
      tag: undefined,
      untagged: undefined,
    }).then(() => {
      document
        .getElementById(
          rootSlug === 'uncategorized'
            ? 'section-uncategorized'
            : rootSlug
              ? `section-category-${rootSlug}`
              : 'section-common',
        )
        ?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
  function selectMode(next: SearchMode) {
    update({ ...search, mode: next, q: draft.trim() || undefined });
  }
  function clearSearch() {
    setDraft('');
    update({ ...search, mode, q: undefined, tag: undefined, untagged: undefined }, true);
  }

  async function pin(bookmark: Bookmark) {
    if (pinRequests.current.has(bookmark.id)) return;
    pinRequests.current.add(bookmark.id);
    setPendingIds(new Set(pinRequests.current));
    try {
      const saved = await api.updateBookmark('', bookmark.id, { isPinned: !bookmark.isPinned });
      if (!alive.current) return;
      setOverrides((prev) => ({ ...prev, [saved.id]: saved }));
      setPinnedVersion((value) => value + 1);
      setNotice(saved.isPinned ? '已加入常用' : '已取消常用');
    } catch (error) {
      if (alive.current) setNotice(error instanceof Error ? error.message : '操作失败，请重试');
    } finally {
      pinRequests.current.delete(bookmark.id);
      if (alive.current) setPendingIds(new Set(pinRequests.current));
    }
  }
  async function saveBookmark(value: BookmarkInput) {
    const saved =
      editor && editor !== 'new'
        ? await api.updateBookmark('', editor.id, value)
        : await api.createBookmark('', value);
    if (!alive.current) return;
    setOverrides((prev) => ({ ...prev, [saved.id]: saved }));
    setVersion((value) => value + 1);
    categories.refresh();
    tags.refresh();
    setEditor(null);
    setNotice('书签已保存');
  }
  const actions: BookmarkActions = {
    authed: auth.authed,
    pendingIds,
    overrides,
    onEdit: setEditor,
    onPin: (bookmark) => {
      void pin(bookmark);
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
    <div className="front-surface min-h-dvh pb-[max(2rem,env(safe-area-inset-bottom))] text-foreground">
      <header className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          to="/"
          search={{}}
          className="flex items-center gap-3 rounded-lg text-base font-semibold"
        >
          <BrandIcon className="size-8" />
          书签柜
        </Link>
        <div className="flex items-center gap-2">
          {auth.authed ? (
            <FrontButton onClick={() => setEditor('new')} className="text-primary">
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
      </header>
      <main className="mx-auto max-w-[1440px] px-4 sm:px-8">
        <h1 className="sr-only">书签柜网站导航</h1>
        <section aria-label="搜索" className="mx-auto max-w-2xl pt-5 pb-10 sm:pt-12 sm:pb-14">
          <div className="mb-5 flex items-center justify-center gap-3">
            <div
              role="group"
              aria-label="搜索模式"
              className="flex rounded-full bg-secondary/70 p-1"
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
                  className={cn('min-h-10 px-5', mode === value && 'bg-card text-foreground')}
                >
                  <Icon className="size-4" />
                  {label}
                </FrontButton>
              ))}
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
            className="flex min-h-14 items-center gap-2 rounded-full border border-border/70 bg-card py-1.5 pr-2 pl-5 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 sm:min-h-16 sm:pl-6"
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
              className="min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground"
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
              <FrontButton className="size-11 p-0" aria-label="清除搜索" onClick={clearSearch}>
                <X className="size-4" />
              </FrontButton>
            ) : null}
            <FrontButton
              type="submit"
              tone="primary"
              disabled={!targetAvailable}
              className="size-11 p-0"
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
          <div className="mt-3 flex min-h-11 items-center justify-center gap-3 text-sm text-muted-foreground">
            {mode === 'web' ? (
              <>
                <label htmlFor="search-engine" className="text-xs">
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
                  className="min-h-11 max-w-44 rounded-full bg-transparent px-3 text-sm"
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
                {bang.engineId ? <span className="text-xs">本次使用 {engine?.name}</span> : null}
              </>
            ) : (
              <details className="w-full">
                <summary className="mx-auto flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-full px-4 hover:bg-secondary">
                  <SlidersHorizontal className="size-4" />
                  筛选{search.tag || search.untagged ? ' · 已启用' : ''}
                </summary>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-card p-4">
                  <label htmlFor="search-tag" className="text-xs">
                    标签
                  </label>
                  <select
                    id="search-tag"
                    aria-label="标签筛选"
                    value={search.untagged ? '__untagged__' : (search.tag ?? '')}
                    onChange={(event) =>
                      update({
                        ...search,
                        mode,
                        q: draft.trim() || undefined,
                        tag:
                          event.target.value && event.target.value !== '__untagged__'
                            ? event.target.value
                            : undefined,
                        untagged: event.target.value === '__untagged__' ? true : undefined,
                      })
                    }
                    className="min-h-11 max-w-full rounded-lg bg-background px-3 text-sm"
                  >
                    <option value="">全部标签</option>
                    <option value="__untagged__">无标签</option>
                    {search.tag && !tags.data?.some((item) => item.slug === search.tag) ? (
                      <option value={search.tag}>当前标签：{search.tag}</option>
                    ) : null}
                    {tags.data?.map((item) => (
                      <option key={item.id} value={item.slug}>
                        {item.name}
                      </option>
                    ))}
                  </select>
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
          <section aria-label="站内搜索结果" className="pb-12">
            <div className="mb-5 flex items-center justify-between gap-3 px-3">
              <h2 className="text-xl font-semibold">
                {search.q ? `搜索“${search.q}”` : search.untagged ? '无标签书签' : '标签筛选'}
              </h2>
              <FrontButton onClick={clearSearch}>清除搜索与筛选</FrontButton>
            </div>
            <FeedContent
              feed={results}
              actions={actions}
              highlighted={highlighted}
              emptyMessage="没有找到匹配的网站，请调整关键词或筛选。"
            />
          </section>
        ) : null}
        <div hidden={searching}>
          <nav
            aria-label="分类导航"
            className="sticky top-0 z-20 -mx-4 border-y border-border/50 bg-background/90 px-4 backdrop-blur-xl sm:-mx-8 sm:px-8"
          >
            <div className="flex overflow-x-auto py-1">
              <FrontButton
                onClick={() => locateSection()}
                className={cn('whitespace-nowrap', !search.category && 'text-primary')}
              >
                常用
              </FrontButton>
              {roots.map((root) => (
                <FrontButton
                  key={root.id}
                  aria-current={browse.activeRoot === root.slug ? 'location' : undefined}
                  onClick={() => locateSection(root.slug)}
                  className={cn(
                    'whitespace-nowrap',
                    browse.activeRoot === root.slug && 'text-primary',
                  )}
                >
                  {root.name}
                </FrontButton>
              ))}
              <FrontButton
                onClick={() => locateSection('uncategorized')}
                aria-current={search.category === 'uncategorized' ? 'location' : undefined}
                className={cn(
                  'whitespace-nowrap',
                  search.category === 'uncategorized' && 'text-primary',
                )}
              >
                未分类
              </FrontButton>
            </div>
          </nav>
          {categories.error ? (
            <div role="alert" className="flex items-center gap-2 py-4 text-sm text-destructive">
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
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
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
      <footer className="mx-auto mt-6 max-w-[1440px] px-7 text-xs text-muted-foreground">
        书签柜
      </footer>
      {notice ? (
        <div
          role="status"
          className="fixed right-4 bottom-4 left-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-4 rounded-2xl border border-border bg-popover py-2 pr-1 pl-5 text-sm text-popover-foreground"
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
