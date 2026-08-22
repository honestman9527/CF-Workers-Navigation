import type { Bookmark } from '@shared/api/types';
import type { SearchEngine } from '@shared/search';

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Globe,
  LoaderCircle,
  Search as SearchIcon,
  TriangleAlert,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ApiError, api } from '@nav/api/client';
import {
  buildSearchUrl,
  domainOf,
  faviconFor,
  looksLikeUrl,
  normalizeNavigateUrl,
  parseBangQuery,
  resolveBookmarkIcon,
} from '@shared/search';

const MAX_LIST = 8;

function EngineFavicon({ engine }: { engine: SearchEngine }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [engine.url]);
  if (failed) return null;
  return (
    <img
      src={faviconFor(domainOf(engine.url))}
      alt=""
      className="size-4 rounded"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function EngineSwitcher({
  engines,
  activeEngineId,
  onChange,
}: {
  engines: SearchEngine[];
  activeEngineId: string;
  onChange: (id: string) => void;
}) {
  const active = engines.find((engine) => engine.id === activeEngineId) ?? engines[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-lg px-2 text-muted-foreground hover:text-foreground"
          />
        }
        aria-label="切换搜索引擎"
      >
        {active ? <EngineFavicon engine={active} /> : null}
        <span className="font-medium">{active?.name}</span>
        <ChevronDown className="size-3 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {engines.map((engine) => (
          <DropdownMenuItem key={engine.id} onClick={() => onChange(engine.id)}>
            <EngineFavicon engine={engine} />
            <span className="font-medium">{engine.name}</span>
            {engine.id === activeEngineId ? (
              <span className="ml-auto size-1.5 rounded-full bg-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LauncherSearch({
  engines,
  defaultEngineId,
  onUnauthorized,
}: {
  engines: SearchEngine[];
  defaultEngineId: string;
  onUnauthorized: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(-1);
  const [activeEngineId, setActiveEngineId] = useState(defaultEngineId);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 外部默认引擎变化（设置加载）时同步，本页未手动切过
  useEffect(() => {
    setActiveEngineId(defaultEngineId);
  }, [defaultEngineId]);

  // 全局 "/" 聚焦搜索
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target as HTMLElement)?.closest('input,textarea')) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const bang = useMemo(() => parseBangQuery(query, engines), [query, engines]);
  const effectiveEngineId = bang.engineId ?? activeEngineId;
  const activeEngine = engines.find((engine) => engine.id === effectiveEngineId) ?? engines[0];
  /** 实际用于书签搜索 / 网页搜索的查询（去掉 bang）。 */
  const searchQuery = bang.engineId !== undefined ? bang.query : query.trim();
  const hasBang = bang.engineId !== undefined;

  const visibleResults = results.slice(0, MAX_LIST);
  const listLen = searchQuery || hasBang ? visibleResults.length : 0;
  const showWebRow = Boolean(searchQuery);
  const totalNav = listLen + (showWebRow ? 1 : 0);

  // 防抖搜索书签（远端 FTS）
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery;
    if (!q) {
      setResults([]);
      setLoading(false);
      setSearchError(null);
      setHighlighted(-1);
      return;
    }
    setLoading(true);
    setSearchError(null);
    debounceRef.current = setTimeout(async () => {
      try {
        const page = await api.searchBookmarks(undefined, q, { limit: MAX_LIST });
        setResults(page.items);
        setSearchError(null);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          onUnauthorized();
        } else {
          setResults([]);
          setSearchError(caught instanceof Error ? caught.message : '无法连接 Nav 服务');
        }
      } finally {
        setHighlighted(-1);
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, onUnauthorized]);

  /** Web 端一律新标签打开。 */
  function openLink(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function doWebSearch() {
    if (!searchQuery || !activeEngine) return;
    openLink(buildSearchUrl(activeEngine, searchQuery));
  }

  function doUrlNavigate(): boolean {
    if (hasBang) return false;
    const q = query.trim();
    if (!q || !looksLikeUrl(q)) return false;
    openLink(normalizeNavigateUrl(q));
    return true;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (totalNav <= 0) return;
      setHighlighted((current) => (current < 0 ? 0 : (current + 1) % totalNav));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (totalNav <= 0) return;
      setHighlighted((current) => (current <= 0 ? totalNav - 1 : current - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();

      // Ctrl/Cmd+Enter：始终网页搜索
      if ((event.metaKey || event.ctrlKey) && searchQuery) {
        doWebSearch();
        return;
      }

      if (highlighted >= 0 && highlighted < listLen) {
        const bookmark = visibleResults[highlighted];
        if (bookmark) openLink(bookmark.url);
        return;
      }

      if (showWebRow && highlighted === listLen) {
        doWebSearch();
        return;
      }

      // 显式 bang → 网页搜索优先（无键盘高亮时）
      if (hasBang && searchQuery) {
        doWebSearch();
        return;
      }

      if (doUrlNavigate()) return;

      // 有书签结果时回车打开第一条，否则网页搜索
      if (visibleResults.length > 0) {
        openLink(visibleResults[0].url);
        return;
      }
      doWebSearch();
      return;
    }
    if (event.key === 'Escape') {
      if (query) {
        setQuery('');
        setResults([]);
        setHighlighted(-1);
        setSearchError(null);
      } else {
        inputRef.current?.blur();
      }
    }
  }

  function handleResultClick(bookmark: Bookmark, event: MouseEvent) {
    event.preventDefault();
    openLink(bookmark.url);
  }

  const showResults =
    focused && (loading || searchError || Boolean(searchQuery) || results.length > 0);
  const placeholder = hasBang
    ? `在 ${activeEngine?.name ?? ''} 中搜索…  (!${bang.bang})`
    : `在 ${activeEngine?.name ?? ''} 中搜索，或搜索你的书签…  (!g 语法)`;

  return (
    <div className="relative w-full max-w-2xl">
      <div className="animate-launcher-enter flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4 shadow-sm transition focus-within:border-primary/50 focus-within:shadow-md">
        <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          autoComplete="off"
          spellCheck={false}
          aria-label="搜索书签或网站"
        />
        <EngineSwitcher
          engines={engines}
          activeEngineId={effectiveEngineId}
          onChange={setActiveEngineId}
        />
      </div>

      {showResults ? (
        <div className="animate-launcher-enter absolute top-full right-0 left-0 z-40 mt-2 overflow-y-auto rounded-2xl border border-border/70 bg-card py-2 shadow-soft">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              搜索中…
            </div>
          ) : null}

          {!loading && searchError ? (
            <div className="px-4 py-3">
              <div className="flex items-start gap-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="font-medium">无法连接 Nav 服务</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{searchError}</p>
                  <p className="mt-1 text-xs text-muted-foreground">仍可使用网页搜索。</p>
                </div>
              </div>
            </div>
          ) : null}

          {!loading && !searchError && searchQuery && results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">未找到匹配的书签</div>
          ) : null}

          {!loading && !searchError && results.length > 0 ? (
            <>
              {visibleResults.map((bookmark, index) => (
                <button
                  key={bookmark.id}
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => handleResultClick(bookmark, event as MouseEvent)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    highlighted === index ? 'bg-muted' : 'hover:bg-muted',
                  )}
                >
                  <img
                    src={resolveBookmarkIcon(bookmark.iconUrl, bookmark.url)}
                    alt=""
                    className="size-5 shrink-0 rounded"
                    loading="lazy"
                    onError={(event) => {
                      const img = event.target as HTMLImageElement;
                      img.style.opacity = '0.35';
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{bookmark.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {domainOf(bookmark.url)}
                    </span>
                  </span>
                </button>
              ))}
              <div className="my-1 border-t border-border/70" />
            </>
          ) : null}

          {!loading && searchQuery ? (
            <button
              type="button"
              onMouseEnter={() => setHighlighted(listLen)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => doWebSearch()}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                highlighted === listLen ? 'bg-muted' : 'hover:bg-muted',
              )}
            >
              <Globe className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 text-muted-foreground">
                在 <span className="font-medium text-foreground">{activeEngine?.name}</span>{' '}
                中搜索「<span className="text-foreground">{searchQuery}</span>」
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      {focused && !showResults ? (
        <div className="animate-launcher-enter pointer-events-none absolute -bottom-8 left-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground opacity-70">
          <span className="flex items-center gap-1">
            <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]">Enter</kbd>
            打开书签 / 搜索
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]">!g</kbd>
            bang 引擎
          </span>
          <span className="flex items-center gap-1">
            <ArrowDown className="size-3" />
            <ArrowUp className="size-3" />
            选择
          </span>
        </div>
      ) : null}
    </div>
  );
}
