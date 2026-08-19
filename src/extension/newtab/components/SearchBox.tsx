import { useState, useRef, useEffect, useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { ArrowDown, ArrowUp, Search as MagnifyingGlass } from "lucide-react";
import type { Bookmark } from "@shared/api/types";
import type { EnterBehavior, SearchEngine } from "@ext/shared/config";
import {
  buildSearchUrl,
  looksLikeUrl,
  normalizeNavigateUrl,
  parseBangQuery,
} from "@ext/shared/config";
import { openLink } from "@ext/shared/navigation";
import type { RecentItem } from "@ext/shared/storage";
import EngineSwitcher from "./EngineSwitcher";
import SearchResults from "./SearchResults";

export type SearchOutcome = {
  bookmarks: Bookmark[];
};

type SearchBoxProps = {
  engines: SearchEngine[];
  defaultEngineId: string;
  openInNewTab: boolean;
  enterBehavior: EnterBehavior;
  /** 最近打开（空查询时展示）。 */
  recents: RecentItem[];
  /** 搜索书签；失败时应 throw。 */
  onSearchBookmarks: (query: string) => Promise<SearchOutcome>;
  /** 打开书签/最近项时回调（用于记录最近；当前标签跳转前会 await）。 */
  onOpenBookmark?: (item: {
    id?: number;
    title: string;
    url: string;
    iconUrl?: string | null;
  }) => void | Promise<void>;
  /** 引擎切换回调（用于记忆上次引擎）。 */
  onEngineChange?: (engineId: string) => void;
  /** 打开设置（错误态用）。 */
  onOpenSettings?: () => void;
};

export default function SearchBox({
  engines,
  defaultEngineId,
  openInNewTab,
  enterBehavior,
  recents,
  onSearchBookmarks,
  onOpenBookmark,
  onEngineChange,
  onOpenSettings,
}: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(-1);
  const [activeEngineId, setActiveEngineId] = useState(defaultEngineId);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_LIST = 8;

  const bang = useMemo(() => parseBangQuery(query, engines), [query, engines]);
  const effectiveEngineId = bang.engineId ?? activeEngineId;
  const activeEngine = engines.find((e) => e.id === effectiveEngineId) ?? engines[0];
  /** 实际用于书签搜索 / 网页搜索的查询（去掉 bang）。 */
  const searchQuery = bang.engineId !== undefined ? bang.query : query.trim();
  const trimmedRaw = query.trim();
  const hasBang = bang.engineId !== undefined;

  const visibleResults = results.slice(0, MAX_LIST);
  const visibleRecents = recents.slice(0, MAX_LIST);
  const showingRecents = focused && !trimmedRaw && visibleRecents.length > 0;
  const listLen = searchQuery || hasBang ? visibleResults.length : showingRecents ? visibleRecents.length : 0;
  const showWebRow = Boolean(searchQuery);
  const totalNav = listLen + (showWebRow ? 1 : 0);

  // 自动聚焦
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 同步外部 defaultEngine 变化（未在本页手动切过时）
  useEffect(() => {
    setActiveEngineId(defaultEngineId);
  }, [defaultEngineId]);

  function changeEngine(id: string) {
    setActiveEngineId(id);
    onEngineChange?.(id);
  }

  // 搜索：短暂防抖后请求远端 FTS。
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = searchQuery;
    // 仅 bang 无关键词：不搜书签
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
        const outcome = await onSearchBookmarks(q);
        setResults(outcome.bookmarks);
        setSearchError(null);
        setHighlighted(-1);
      } catch (err) {
        setResults([]);
        setSearchError(err instanceof Error ? err.message : "无法连接 Nav 服务");
        setHighlighted(-1);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, onSearchBookmarks]);

  function navigate(url: string, forceNewTab = false) {
    openLink(url, { openInNewTab, forceNewTab });
  }

  async function openBookmark(
    item: { id?: number; title: string; url: string; iconUrl?: string | null },
    forceNewTab = false
  ) {
    try {
      await onOpenBookmark?.(item);
    } catch {
      // 记录失败不阻断导航
    }
    navigate(item.url, forceNewTab);
  }

  function doWebSearch(forceNewTab = false) {
    const q = searchQuery;
    if (!q || !activeEngine) return;
    navigate(buildSearchUrl(activeEngine, q), forceNewTab);
  }

  function doUrlNavigate(forceNewTab = false) {
    // bang 场景不走 URL 直达
    if (hasBang) return false;
    const q = query.trim();
    if (!q || !looksLikeUrl(q)) return false;
    navigate(normalizeNavigateUrl(q), forceNewTab);
    return true;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (totalNav <= 0) return;
      setHighlighted((h) => (h < 0 ? 0 : (h + 1) % totalNav));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (totalNav <= 0) return;
      setHighlighted((h) => (h <= 0 ? totalNav - 1 : h - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const forceNewTab = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd+Enter：始终网页搜索
      if (forceNewTab && searchQuery) {
        doWebSearch(true);
        return;
      }

      if (highlighted >= 0 && highlighted < listLen) {
        if (searchQuery || hasBang) {
          const bm = visibleResults[highlighted];
          if (bm) void openBookmark(bm, false);
        } else if (showingRecents) {
          const item = visibleRecents[highlighted];
          if (item) void openBookmark(item, false);
        }
        return;
      }

      if (showWebRow && highlighted === listLen) {
        doWebSearch(false);
        return;
      }

      // 显式 bang → 网页搜索优先（无书签高亮时）
      if (hasBang && searchQuery) {
        if (enterBehavior === "bookmark" && visibleResults.length > 0) {
          void openBookmark(visibleResults[0], false);
          return;
        }
        doWebSearch(false);
        return;
      }

      if (doUrlNavigate(false)) return;

      if (enterBehavior === "bookmark" && visibleResults.length > 0) {
        void openBookmark(visibleResults[0], false);
        return;
      }
      doWebSearch(false);
      return;
    }
    if (e.key === "Escape") {
      if (query) {
        setQuery("");
        setResults([]);
        setHighlighted(-1);
        setSearchError(null);
      } else {
        inputRef.current?.blur();
      }
    }
  }

  function handleResultClick(bm: Bookmark, e: MouseEvent) {
    void openBookmark(bm, e.metaKey || e.ctrlKey || e.button === 1);
  }

  function handleRecentClick(item: RecentItem, e: MouseEvent) {
    void openBookmark(item, e.metaKey || e.ctrlKey || e.button === 1);
  }

  function handleWebSearchClick(e: MouseEvent) {
    doWebSearch(e.metaKey || e.ctrlKey || e.button === 1);
  }

  const showResults =
    focused &&
    (loading ||
      searchError ||
      results.length > 0 ||
      (Boolean(searchQuery) && !loading) ||
      showingRecents);

  const placeholder = hasBang
    ? `在 ${activeEngine?.name ?? ""} 中搜索…  (!${bang.bang})`
    : `在 ${activeEngine?.name ?? ""} 中搜索，或搜索你的书签…  (!g 语法)`;

  return (
    <div className="relative w-full max-w-2xl">
      <div className="glass-panel animate-newtab-enter relative flex items-center gap-3 rounded-2xl px-5 py-4">
        <MagnifyingGlass size={22} className="shrink-0 opacity-50" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-base text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <EngineSwitcher
          engines={engines}
          activeEngineId={effectiveEngineId}
          onChange={changeEngine}
        />
      </div>

      {showResults && (
          <SearchResults
            results={visibleResults}
            recents={showingRecents ? visibleRecents : []}
            loading={loading}
            error={searchError}
            highlighted={highlighted}
            query={searchQuery}
            onHover={setHighlighted}
            onSelectBookmark={handleResultClick}
            onSelectRecent={handleRecentClick}
            onWebSearch={handleWebSearchClick}
            onOpenSettings={onOpenSettings}
            engineName={activeEngine?.name ?? ""}
          />
        )}

      {focused && !showResults && (
        <div className="animate-newtab-enter pointer-events-none absolute -bottom-9 left-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] opacity-60">
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5">Enter</kbd>
            {enterBehavior === "bookmark" ? "打开书签 / 搜索" : "网页搜索"}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5">!g</kbd>
            bang 引擎
          </span>
          <span className="flex items-center gap-1">
            <ArrowDown size={12} />
            <ArrowUp size={12} /> 导航
          </span>
        </div>
      )}
    </div>
  );
}
