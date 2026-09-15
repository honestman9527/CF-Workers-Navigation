import type { Bookmark } from '@shared/api/types';
import type { SearchEngine } from '@shared/search';

import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '@nav/api/client';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { AppHeader } from '@nav/features/layout/AppHeader';
import { Brand } from '@nav/features/layout/Brand';
import { HeaderMenu } from '@nav/features/layout/HeaderMenu';
import { setPreferredFrontView } from '@nav/features/settings/store';
import { useBackground } from '@nav/hooks/useBackground';
import { useSettings } from '@nav/hooks/useSettings';
import { useTheme } from '@nav/hooks/useTheme';
import { buildSearchUrl, parseBangQuery, DEFAULT_SEARCH_ENGINES } from '@shared/search';

import { LauncherResults } from './LauncherResults';
import { LauncherSearch } from './LauncherSearch';
import { Launchpad } from './Launchpad';
import { useLauncherResults } from './useLauncherResults';

const routeApi = getRouteApi('/launch');

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了，注意休息';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

async function fetchAllPinned(signal: AbortSignal): Promise<Bookmark[]> {
  const items: Bookmark[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.getBookmarks(
      undefined,
      { pinned: true, cursor: cursor ?? undefined, limit: 100 },
      signal,
    );
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && !signal.aborted);
  return items;
}

/** Web 端一律新标签打开。 */
function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** 启动台（/launch）：搜索胶囊（URL 驱动），搜索结果展示在「常用网站」同一主区域位置。 */
export function LauncherPage() {
  const auth = useAuthContext();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const search = routeApi.useSearch();
  const [pinned, setPinned] = useState<Bookmark[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(true);
  const [pinnedError, setPinnedError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  // 全量书签搜索结果（在「常用网站」位置展示）
  const {
    results,
    loading: resultsLoading,
    error: resultsError,
  } = useLauncherResults(searchQuery, handleUnauthorized);
  const [highlighted, setHighlighted] = useState(-1);
  useEffect(() => {
    setHighlighted(-1);
  }, [searchQuery]);

  function doWebSearch() {
    if (!searchQuery || !activeEngine) return;
    openLink(buildSearchUrl(activeEngine, searchQuery));
  }

  // 常用网站：置顶书签（全部加载）
  useEffect(() => {
    const controller = new AbortController();
    setPinnedLoading(true);
    setPinnedError(null);
    fetchAllPinned(controller.signal)
      .then((items) => setPinned(items))
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setPinnedError(caught instanceof Error ? caught.message : '加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPinnedLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    document.title = '启动台 · 书签柜';
    setPreferredFrontView('launcher');
  }, []);

  const searching = query.trim().length > 0;

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

      <main className="flex flex-1 flex-col items-center px-4 pb-16 sm:px-6">
        <div className="flex w-full max-w-3xl flex-col items-center gap-8 pt-[clamp(3rem,12vh,7rem)]">
          <div className="animate-launcher-enter text-center">
            <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
              personal index
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">{greeting()}</h1>
          </div>

          <LauncherSearch
            engines={searchEngines}
            query={query}
            onQueryChange={setQuery}
            activeEngineId={effectiveEngineId}
            onEngineChange={handleEngineChange}
            searchQuery={searchQuery}
            hasBang={hasBang}
            bangName={bang.bang}
            activeEngine={activeEngine}
            results={results}
            highlighted={highlighted}
            onHighlightChange={setHighlighted}
          />

          {searching ? (
            <LauncherResults
              results={results}
              loading={resultsLoading}
              error={resultsError}
              searchQuery={searchQuery}
              activeEngine={activeEngine}
              highlighted={highlighted}
              onHighlightChange={setHighlighted}
              onOpenBookmark={(bookmark) => openLink(bookmark.url)}
              onWebSearch={doWebSearch}
            />
          ) : (
            <div className="animate-launcher-enter w-full" style={{ animationDelay: '80ms' }}>
              <Launchpad
                bookmarks={pinned}
                loading={pinnedLoading}
                error={pinnedError}
                onRetry={() => setRefreshKey((value) => value + 1)}
                onOpenWorkspace={() => void navigate({ to: '/workspace' })}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
