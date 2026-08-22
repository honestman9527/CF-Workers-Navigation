import type { Bookmark } from '@shared/api/types';
import type { SearchEngine } from '@shared/search';

import { useNavigate } from '@tanstack/react-router';
import {
  Bookmark as BookmarkIcon,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiError, api } from '@nav/api/client';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { useTheme } from '@nav/hooks/useTheme';
import { DEFAULT_SEARCH_ENGINES } from '@shared/search';

import { LauncherSearch } from './LauncherSearch';
import { Launchpad } from './Launchpad';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了，注意休息';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/** 启动台首页：中部搜索框（可配置引擎）+ 常用网站（置顶书签）。 */
export function LauncherPage() {
  const auth = useAuthContext();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [searchEngines, setSearchEngines] = useState<SearchEngine[]>(DEFAULT_SEARCH_ENGINES);
  const [defaultEngineId, setDefaultEngineId] = useState('google');
  const [pinned, setPinned] = useState<Bookmark[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(true);
  const [pinnedError, setPinnedError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUnauthorized = useCallback(() => {
    void auth.logout();
  }, [auth]);

  // 引擎配置来自服务端设置（缺省回退默认）
  useEffect(() => {
    let alive = true;
    api
      .getSettings()
      .then((data) => {
        if (!alive) return;
        const engines = data.searchEngines.length > 0 ? data.searchEngines : DEFAULT_SEARCH_ENGINES;
        setSearchEngines(engines);
        const ids = engines.map((engine) => engine.id);
        setDefaultEngineId(ids.includes(data.defaultEngineId) ? data.defaultEngineId : ids[0]);
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) {
          if (alive) handleUnauthorized();
        }
        // 其他错误沿用默认引擎，不打扰
      });
    return () => {
      alive = false;
    };
  }, []);

  // 常用网站：置顶书签
  useEffect(() => {
    const controller = new AbortController();
    setPinnedLoading(true);
    setPinnedError(null);
    api
      .getBookmarks(undefined, { pinned: true, limit: 100 }, controller.signal)
      .then((page) => setPinned(page.items))
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        if (caught instanceof ApiError && caught.status === 401) {
          handleUnauthorized();
          return;
        }
        setPinnedError(caught instanceof Error ? caught.message : '加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPinnedLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    document.title = '启动台 · 书签柜';
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 pt-[var(--safe-t)] backdrop-blur-xl">
        <div className="flex h-[var(--header-h)] items-center justify-between gap-4 px-4 sm:px-8">
          <button
            type="button"
            onClick={() => void navigate({ to: '/workspace' })}
            className="flex items-center gap-3"
            aria-label="进入书签柜"
          >
            <span className="grid size-9 place-items-center rounded-[0.9rem] bg-primary text-primary-foreground shadow-sm">
              <BookmarkIcon />
            </span>
            <span className="text-left">
              <strong className="block font-display text-base">书签柜</strong>
              <span className="hidden text-[10px] tracking-[0.2em] text-muted-foreground uppercase sm:block">
                personal index
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-full px-3"
              onClick={() => void navigate({ to: '/workspace' })}
            >
              <LayoutDashboard className="size-4 text-primary" />
              书签柜
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full px-2.5"
                    aria-label="菜单"
                  />
                }
              >
                <UserRound className="size-4 text-primary" />
                <ChevronDown className="size-3 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  {theme === 'dark' ? '切换为亮色' : '切换为暗色'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void navigate({ to: '/admin' })}>
                  <LayoutDashboard className="size-4 text-primary" />
                  管理后台
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void auth.logout()}>
                  <LogOut className="size-4" />
                  退出
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 pb-16 sm:px-6">
        <div className="flex w-full max-w-3xl flex-col items-center gap-8 pt-[clamp(3rem,12vh,7rem)]">
          <div className="animate-launcher-enter text-center">
            <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
              personal index
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting()}
            </h1>
          </div>

          <LauncherSearch
            engines={searchEngines}
            defaultEngineId={defaultEngineId}
            onUnauthorized={handleUnauthorized}
          />

          <div className="animate-launcher-enter w-full" style={{ animationDelay: '80ms' }}>
            <Launchpad
              bookmarks={pinned}
              loading={pinnedLoading}
              error={pinnedError}
              onRetry={() => setRefreshKey((value) => value + 1)}
              onOpenWorkspace={() => void navigate({ to: '/workspace' })}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
