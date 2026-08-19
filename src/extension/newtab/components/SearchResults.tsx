import type { MouseEvent } from "react";
import {
  CircleAlert as WarningCircle,
  History as ClockCounterClockwise,
  LoaderCircle as Spinner,
} from "lucide-react";
import type { Bookmark } from "@shared/api/types";
import { resolveBookmarkIcon, domainOf } from "@ext/shared/config";
import type { RecentItem } from "@ext/shared/storage";

type SearchResultsProps = {
  results: Bookmark[];
  recents: RecentItem[];
  loading: boolean;
  error: string | null;
  highlighted: number;
  query: string;
  onHover: (index: number) => void;
  onSelectBookmark: (bm: Bookmark, e: MouseEvent) => void;
  onSelectRecent: (item: RecentItem, e: MouseEvent) => void;
  onWebSearch: (e: MouseEvent) => void;
  onOpenSettings?: () => void;
  engineName: string;
};

export default function SearchResults({
  results,
  recents,
  loading,
  error,
  highlighted,
  query,
  onHover,
  onSelectBookmark,
  onSelectRecent,
  onWebSearch,
  onOpenSettings,
  engineName,
}: SearchResultsProps) {
  const showingRecents = !query && recents.length > 0;
  const listLen = query ? results.length : recents.length;
  const webRowIndex = query ? listLen : -1;

  return (
    <div
      className="glass-panel animate-newtab-enter absolute left-0 right-0 top-full z-40 mt-2 overflow-y-auto rounded-2xl py-2"
      style={{ maxHeight: "min(420px, calc(100dvh - 18rem))" }}
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-[var(--text-secondary)]">
          <Spinner size={16} className="animate-spin" />
          搜索中…
        </div>
      )}

      {!loading && error && (
        <div className="px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-amber-400/90">
            <WarningCircle size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">无法连接 Nav 服务</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{error}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                仍可使用网页搜索
                {onOpenSettings ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={onOpenSettings}
                      className="text-[var(--cobalt)] underline-offset-2 hover:underline"
                    >
                      打开设置
                    </button>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && showingRecents && (
        <>
          <div className="flex items-center gap-1.5 px-4 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-secondary)] opacity-70">
            <ClockCounterClockwise size={12} />
            最近打开
          </div>
          {recents.slice(0, 8).map((item, i) => (
            <ResultRow
              key={`${item.url}-${item.ts}`}
              active={i === highlighted}
              icon={resolveBookmarkIcon(item.iconUrl, item.url)}
              title={item.title}
              subtitle={domainOf(item.url)}
              onHover={() => onHover(i)}
              onClick={(e) => onSelectRecent(item, e)}
            />
          ))}
        </>
      )}

      {!loading && !error && query && results.length === 0 && (
        <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">未找到匹配的书签</div>
      )}

      {!loading && !error && query && results.length > 0 && (
        <>
          {results.slice(0, 8).map((bm, i) => (
            <ResultRow
              key={bm.id}
              active={i === highlighted}
              icon={resolveBookmarkIcon(bm.iconUrl, bm.url)}
              title={bm.title}
              subtitle={domainOf(bm.url)}
              onHover={() => onHover(i)}
              onClick={(e) => onSelectBookmark(bm, e)}
            />
          ))}
          <div className="my-1 border-t border-[var(--border-color)]" />
        </>
      )}

      {/* 网页搜索入口：有 query 且非 loading 时始终显示（含 error 兜底） */}
      {!loading && query && (
        <button
          type="button"
          onMouseEnter={() => onHover(webRowIndex)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onWebSearch}
          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
            highlighted === webRowIndex ? "bg-[var(--bg-muted)]" : "hover:bg-[var(--bg-muted)]"
          }`}
        >
          <span className="text-base">🌐</span>
          <span className="text-[var(--text-secondary)]">
            在 <span className="font-medium text-[var(--text-primary)]">{engineName}</span> 中搜索「
            <span className="text-[var(--text-primary)]">{query}</span>」
          </span>
        </button>
      )}
    </div>
  );
}

function ResultRow({
  active,
  icon,
  title,
  subtitle,
  onHover,
  onClick,
}: {
  active: boolean;
  icon: string;
  title: string;
  subtitle: string;
  onHover: () => void;
  onClick: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClick(e);
        }
      }}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        active ? "bg-[var(--bg-muted)]" : "hover:bg-[var(--bg-muted)]"
      }`}
    >
      <img
        src={icon}
        alt=""
        className="h-5 w-5 shrink-0 rounded"
        loading="lazy"
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          img.style.opacity = "0.35";
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--text-primary)]">{title}</div>
        <div className="truncate text-xs text-[var(--text-secondary)]">{subtitle}</div>
      </div>
    </button>
  );
}
