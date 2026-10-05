import type { Bookmark } from '@shared/api/types';
import type { SearchEngine } from '@shared/search';

import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, ApiError } from '@nav/api/client';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { AppHeader } from '@nav/features/layout/AppHeader';
import { Brand } from '@nav/features/layout/Brand';
import { HeaderMenu } from '@nav/features/layout/HeaderMenu';
import { setPreferredFrontView } from '@nav/features/settings/store';
import { useIsMobile } from '@nav/hooks/use-mobile';
import { useBackground } from '@nav/hooks/useBackground';
import { useSettings } from '@nav/hooks/useSettings';
import { useTheme } from '@nav/hooks/useTheme';
import { buildSearchUrl, parseBangQuery, DEFAULT_SEARCH_ENGINES } from '@shared/search';

import { LauncherClock } from './LauncherClock';
import { LauncherDock } from './LauncherDock';
import { LauncherResults } from './LauncherResults';
import { LauncherSearch } from './LauncherSearch';
import { useLauncherResults } from './useLauncherResults';

const routeApi = getRouteApi('/launch');

const PINNED_PAGE_SIZE = 24;

/** Web 端一律新标签打开。 */
function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** 启动台（/launch）：本地时间、URL 驱动搜索与独立常用 Dock。 */
export function LauncherPage() {
  const auth = useAuthContext();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const search = routeApi.useSearch();
  const isMobile = useIsMobile();
  const [searchFocused, setSearchFocused] = useState(false);
  const [pinned, setPinned] = useState<Bookmark[]>([]);
  const [pinnedNextCursor, setPinnedNextCursor] = useState<string | null>(null);
  const [pinnedLoading, setPinnedLoading] = useState(true);
  const [pinnedLoadingMore, setPinnedLoadingMore] = useState(false);
  const [pinnedError, setPinnedError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const pinnedControllerRef = useRef<AbortController | null>(null);

  const handleUnauthorized = useCallback(() => {
    void auth.logout();
  }, [auth]);

  // 服务端设置（搜索引擎 + 背景图片），401 时登出
  const settings = useSettings(handleUnauthorized);
  useBackground(settings);

  const searchEngines = useMemo<SearchEngine[]>(
    () =>
      settings && settings.searchEngines.length > 0
        ? settings.searchEngines
        : DEFAULT_SEARCH_ENGINES,
    [settings],
  );
  const defaultEngineId = useMemo(() => {
    const ids = searchEngines.map((engine) => engine.id);
    return settings && ids.includes(settings.defaultEngineId) ? settings.defaultEngineId : ids[0];
  }, [settings, searchEngines]);

  // 搜索关键词：URL 驱动（/launch?q=…），刷新/后退不回退。
  const [query, setQuery] = useState(search.q ?? '');
  useEffect(() => {
    setQuery(search.q ?? '');
  }, [search.q]);
  useEffect(() => {
    const draft = query.trim();
    if (draft === (search.q ?? '')) return;
    const timer = window.setTimeout(() => {
      void navigate({
        to: '/launch',
        search: (prev) => ({ ...prev, q: draft || undefined }),
        replace: true,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [navigate, query, search.q]);

  // 搜索引擎：URL 驱动（/launch?engine=…），未手动选择时跟随服务端默认。
  const [engineId, setEngineId] = useState(search.engine ?? defaultEngineId);
  useEffect(() => {
    setEngineId(search.engine ?? defaultEngineId);
  }, [search.engine, defaultEngineId]);
  function handleEngineChange(id: string) {
    setEngineId(id);
    void navigate({
      to: '/launch',
      search: (prev) => ({ ...prev, engine: id }),
      replace: true,
    });
  }

  // bang 语法推导：实际用于书签搜索 / 网页搜索的查询与生效引擎。
  const bang = useMemo(() => parseBangQuery(query, searchEngines), [query, searchEngines]);
  const effectiveEngineId = bang.engineId ?? engineId;
  const activeEngine =
    searchEngines.find((engine) => engine.id === effectiveEngineId) ?? searchEngines[0];
  const searchQuery = bang.engineId !== undefined ? bang.query : query.trim();
  const hasBang = bang.engineId !== undefined;

  // 站内书签结果分批展示在搜索框下方。
  const {
    results,
    nextCursor: resultsNextCursor,
    loading: resultsLoading,
    loadingMore: resultsLoadingMore,
    error: resultsError,
    loadMore: loadMoreResults,
    retry: retryResults,
  } = useLauncherResults(searchQuery, handleUnauthorized);
  const [highlighted, setHighlighted] = useState(-1);
  useEffect(() => {
    setHighlighted(-1);
  }, [searchQuery]);

  function doWebSearch() {
    if (!searchQuery || !activeEngine) return;
    openLink(buildSearchUrl(activeEngine, searchQuery));
  }

  const searching = searchQuery.length > 0;

  // 常用加载独立于搜索与 Dock 的可见状态。
  useEffect(() => {
    const controller = new AbortController();
    pinnedControllerRef.current = controller;
    setPinned([]);
    setPinnedNextCursor(null);
    setPinnedLoading(true);
    setPinnedLoadingMore(false);
    setPinnedError(null);
    api
      .getBookmarks(undefined, { pinned: true, limit: PINNED_PAGE_SIZE }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setPinned(page.items);
        setPinnedNextCursor(page.nextCursor);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 401) {
          handleUnauthorized();
          return;
        }
        setPinnedError(caught instanceof Error ? caught.message : '加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPinnedLoading(false);
      });
    return () => {
      controller.abort();
      if (pinnedControllerRef.current === controller) pinnedControllerRef.current = null;
    };
  }, [refreshKey, handleUnauthorized]);

  const loadMorePinned = useCallback(async () => {
    const controller = pinnedControllerRef.current;
    if (!controller || !pinnedNextCursor || pinnedLoading || pinnedLoadingMore) return;
    setPinnedLoadingMore(true);
    setPinnedError(null);
    try {
      const page = await api.getBookmarks(
        undefined,
        { pinned: true, cursor: pinnedNextCursor, limit: PINNED_PAGE_SIZE },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setPinned((previous) => [...previous, ...page.items]);
      setPinnedNextCursor(page.nextCursor);
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) {
        handleUnauthorized();
        return;
      }
      setPinnedError(caught instanceof Error ? caught.message : '加载更多失败');
    } finally {
      if (!controller.signal.aborted) setPinnedLoadingMore(false);
    }
  }, [pinnedNextCursor, pinnedLoading, pinnedLoadingMore, handleUnauthorized]);

  useEffect(() => {
    document.title = '启动台 · 书签柜';
    setPreferredFrontView('launcher');
  }, []);

  return (
    <div className="app-root flex min-h-dvh flex-col bg-background text-foreground">
      <AppHeader
        brand={<Brand onClick={() => void navigate({ to: '/workspace' })} />}
        menu={
          <HeaderMenu
            theme={theme}
            resolvedTheme={resolvedTheme}
            onThemeChange={setTheme}
            onOpenWorkspace={() => void navigate({ to: '/workspace' })}
            onOpenAdmin={() => void navigate({ to: '/admin' })}
            onLogout={() => void auth.logout()}
          />
        }
      />

      <main className="flex flex-1 flex-col items-center px-4 pb-[calc(12rem+var(--safe-b))] sm:px-6">
        <div className="flex w-full max-w-3xl flex-col items-center gap-6 pt-[clamp(1.5rem,6vh,3rem)]">
          <LauncherClock />

          <LauncherSearch
            engines={searchEngines}
            query={query}
            onQueryChange={setQuery}
            onFocusChange={setSearchFocused}
            activeEngineId={effectiveEngineId}
            onEngineChange={handleEngineChange}
            searchQuery={searchQuery}
            hasBang={hasBang}
            bangName={bang.bang}
            activeEngine={activeEngine}
            results={results}
            hasMore={Boolean(resultsNextCursor)}
            loadingMore={resultsLoadingMore}
            onLoadMore={() => void loadMoreResults()}
            highlighted={highlighted}
            onHighlightChange={setHighlighted}
          />

          {searching ? (
            <LauncherResults
              onRetry={retryResults}
              results={results}
              hasMore={Boolean(resultsNextCursor)}
              loadingMore={resultsLoadingMore}
              onLoadMore={() => void loadMoreResults()}
              loading={resultsLoading}
              error={resultsError}
              searchQuery={searchQuery}
              activeEngine={activeEngine}
              highlighted={highlighted}
              onHighlightChange={setHighlighted}
              onOpenBookmark={(bookmark) => openLink(bookmark.url)}
              onWebSearch={doWebSearch}
            />
          ) : null}
        </div>
      </main>
      <LauncherDock
        bookmarks={pinned}
        hasMore={Boolean(pinnedNextCursor)}
        loading={pinnedLoading}
        loadingMore={pinnedLoadingMore}
        error={pinnedError}
        hidden={isMobile && searchFocused}
        onRetry={() => setRefreshKey((value) => value + 1)}
        onLoadMore={() => void loadMorePinned()}
        onOpenWorkspace={() => void navigate({ to: '/workspace' })}
      />
    </div>
  );
}
