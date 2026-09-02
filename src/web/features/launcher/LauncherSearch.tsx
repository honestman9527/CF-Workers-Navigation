import type { Bookmark } from '@shared/api/types';
import type { SearchEngine } from '@shared/search';

import { ArrowDown, ArrowUp, ChevronDown, Search as SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  buildSearchUrl,
  domainOf,
  faviconFor,
  looksLikeUrl,
  normalizeNavigateUrl,
} from '@shared/search';

function EngineFavicon({ engine }: { engine: SearchEngine }) {
  return (
    <ImageWithFallback
      src={faviconFor(domainOf(engine.url))}
      className="size-4 rounded"
      loading="lazy"
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

/**
 * 启动台搜索胶囊：输入框 + 引擎切换 + 键盘导航。
 * 只负责输入与交互，书签结果由页面在「常用网站」位置用 LauncherResults 展示。
 */
export function LauncherSearch({
  engines,
  query,
  onQueryChange,
  activeEngineId,
  onEngineChange,
  searchQuery,
  hasBang,
  bangName,
  activeEngine,
  results,
  highlighted,
  onHighlightChange,
}: {
  engines: SearchEngine[];
  query: string;
  onQueryChange: (query: string) => void;
  activeEngineId: string;
  onEngineChange: (id: string) => void;
  searchQuery: string;
  hasBang: boolean;
  bangName?: string;
  activeEngine?: SearchEngine;
  /** 全量书签结果（来自页面 / useLauncherResults），用于键盘导航范围。 */
  results: Bookmark[];
  highlighted: number;
  onHighlightChange: (index: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const listLen = results.length;
  const showWebRow = Boolean(searchQuery);
  const totalNav = listLen + (showWebRow ? 1 : 0);

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
      onHighlightChange(highlighted < 0 ? 0 : (highlighted + 1) % totalNav);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (totalNav <= 0) return;
      onHighlightChange(highlighted <= 0 ? totalNav - 1 : highlighted - 1);
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
        const bookmark = results[highlighted];
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
      if (results.length > 0) {
        openLink(results[0].url);
        return;
      }
      doWebSearch();
      return;
    }
    if (event.key === 'Escape') {
      if (query) onQueryChange('');
      else inputRef.current?.blur();
    }
  }

  const placeholder = hasBang
    ? `在 ${activeEngine?.name ?? ''} 中搜索…  (!${bangName})`
    : `在 ${activeEngine?.name ?? ''} 中搜索，或搜索你的书签…  (!g 语法)`;

  return (
    <div className="w-full max-w-2xl">
      <div className="animate-launcher-enter flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4 shadow-sm transition focus-within:border-primary/50 focus-within:shadow-md">
        <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
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
          activeEngineId={activeEngineId}
          onChange={onEngineChange}
        />
      </div>

      {focused && !query.trim() ? (
        <div className="animate-launcher-enter mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground opacity-70">
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
