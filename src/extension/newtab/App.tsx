import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { ArrowRight, CircleAlert as WarningCircle, Settings as Gear } from "lucide-react";
import type { Bookmark } from "@shared/api/types";
import type { ExtConfig } from "@ext/shared/config";
import {
  getConfig,
  onConfigChange,
  getBackgroundImage,
  getPinnedCache,
  setPinnedCache,
  getRecentItems,
  pushRecentItem,
  getLastEngineId,
  setLastEngineId,
  MSG_BOOKMARKS_CHANGED,
  isCacheForScope,
  isCacheFresh,
  type BookmarksChangedMessage,
  type RecentItem,
} from "@ext/shared/storage";
import { api, ApiError } from "@ext/shared/api/client";
import SearchBox, { type SearchOutcome } from "./components/SearchBox";
import Clock from "./components/Clock";

const Dock = lazy(() => import("./components/Dock"));

export default function App() {
  const [config, setConfig] = useState<ExtConfig | null>(null);
  const [pinned, setPinned] = useState<Bookmark[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);
  const [pinnedError, setPinnedError] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [initialEngineId, setInitialEngineId] = useState<string | null>(null);

  // 加载配置 + 最近 + 上次引擎
  useEffect(() => {
    void (async () => {
      const cfg = await getConfig();
      setConfig(cfg);
      const [recentList, lastEngine, uploadedBackground] = await Promise.all([
        getRecentItems(),
        getLastEngineId(),
        cfg.background.type !== "none" ? getBackgroundImage() : Promise.resolve(null),
      ]);
      setRecents(recentList);
      setBgImage(uploadedBackground);
      if (cfg.rememberLastEngine && lastEngine && cfg.searchEngines.some((e) => e.id === lastEngine)) {
        setInitialEngineId(lastEngine);
      } else {
        setInitialEngineId(cfg.defaultEngineId);
      }
    })();

    const unsub = onConfigChange((cfg) => {
      setConfig(cfg);
      // 关闭记忆时回到默认引擎
      if (!cfg.rememberLastEngine) {
        setInitialEngineId(cfg.defaultEngineId);
      }
      if (cfg.background.type !== "none") {
        void getBackgroundImage().then(setBgImage);
      } else {
        setBgImage(null);
      }
    });
    return unsub;
  }, []);

  const loadPinned = useCallback(async (cfg: ExtConfig) => {
    if (!cfg.apiBaseUrl) {
      setPinned([]);
      setPinnedLoading(false);
      setPinnedError(null);
      return;
    }

    const cache = await getPinnedCache();
    const cacheValid = isCacheForScope(cache, cfg.apiBaseUrl, cfg.adminToken);

    if (cacheValid) {
      setPinned(cache!.data);
      setPinnedLoading(false);
      setPinnedError(null);
      if (isCacheFresh(cache, cfg.apiBaseUrl, cfg.adminToken)) return;
    } else {
      setPinnedLoading(true);
    }
    setPinnedError(null);

    try {
      const page = await api.getBookmarks(cfg.apiBaseUrl, cfg.adminToken, { pinned: true, limit: 100 });
      setPinned(page.items);
      setPinnedError(null);
      await setPinnedCache(cfg.apiBaseUrl, cfg.adminToken, page.items);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "网络错误";
      if (cacheValid) {
        setPinnedError(`离线，显示缓存 · ${msg}`);
      } else {
        setPinnedError(msg);
        setPinned([]);
      }
    } finally {
      setPinnedLoading(false);
    }
  }, []);

  // 配置变化时加载 dock
  useEffect(() => {
    if (config) {
      void loadPinned(config);
    }
  }, [config?.apiBaseUrl, config?.adminToken, loadPinned, config]);

  // popup / 右键收藏成功后刷新
  useEffect(() => {
    if (!config?.apiBaseUrl) return;

    const onMessage = (message: unknown) => {
      const msg = message as BookmarksChangedMessage | undefined;
      if (msg?.type !== MSG_BOOKMARKS_CHANGED) return;
      if (msg.affectsPinned) void loadPinned(config);
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [config, loadPinned]);

  // 远端 FTS，避免在扩展中下载并维护全量书签索引。
  const handleSearchBookmarks = useCallback(
    async (query: string): Promise<SearchOutcome> => {
      if (!config?.apiBaseUrl) {
        throw new Error("未配置 API 地址");
      }

      try {
        const page = await api.searchBookmarks(config.apiBaseUrl, config.adminToken, query, { limit: 8 });
        return { bookmarks: page.items };
      } catch (err) {
        if (err instanceof ApiError) throw new Error(err.message);
        throw new Error("网络错误，请检查 API 地址与主机权限");
      }
    },
    [config]
  );

  const handleOpenBookmark = useCallback(
    async (item: { id?: number; title: string; url: string; iconUrl?: string | null }) => {
      const next = await pushRecentItem({
        id: item.id,
        title: item.title,
        url: item.url,
        iconUrl: item.iconUrl,
      });
      setRecents(next);
    },
    []
  );

  const handleEngineChange = useCallback(
    (engineId: string) => {
      setInitialEngineId(engineId);
      if (config?.rememberLastEngine) {
        void setLastEngineId(engineId);
      }
    },
    [config?.rememberLastEngine]
  );

  function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  if (!config || initialEngineId === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] border-t-[var(--cobalt)]" />
      </div>
    );
  }

  if (!config.apiBaseUrl) {
    const bg = config.background;
    const sources = resolveBackgroundSources(bg, bgImage);
    return (
      <>
        {sources.primary || sources.fallback ? (
          <BackgroundLayer
            url={sources.primary}
            fallbackUrl={sources.fallback}
            blur={bg.blur}
            dim={bg.dim}
          />
        ) : null}
        <div className="animate-newtab-enter relative z-10 flex min-h-dvh flex-col items-center justify-center px-6">
          <div className="glass-panel max-w-md rounded-3xl p-10 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--cobalt)] text-2xl">
              🧭
            </div>
            <h1 className="text-xl font-medium text-[var(--text-primary)]">欢迎使用 Nav</h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              这是一个连接 Nav 书签服务的新标签页。
              <br />
              请先在设置中配置你的 API 地址。
            </p>
            <button
              onClick={openSettings}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--lacquer)] px-5 py-2.5 text-sm font-medium text-[var(--background)] transition-opacity hover:opacity-90"
            >
              打开设置
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </>
    );
  }

  const bg = config.background;
  const bgSources = resolveBackgroundSources(bg, bgImage);
  const softPinnedWarning = pinnedError && pinned.length > 0 ? pinnedError : null;
  const hardPinnedError = pinnedError && pinned.length === 0 ? pinnedError : null;
  const centerPadTop = config.clockDensity === "hidden" ? "14dvh" : config.clockDensity === "compact" ? "12dvh" : "10dvh";

  return (
    <>
      {(bgSources.primary || bgSources.fallback) && (
        <BackgroundLayer
          url={bgSources.primary}
          fallbackUrl={bgSources.fallback}
          blur={bg.blur}
          dim={bg.dim}
        />
      )}
      <div className="relative z-10 flex min-h-dvh flex-col">
        <button
          onClick={openSettings}
          className="animate-newtab-enter fixed right-5 top-5 z-50 flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
          aria-label="设置"
        >
          <Gear size={20} />
        </button>

        {softPinnedWarning && (
          <div className="animate-newtab-enter fixed left-1/2 top-5 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-500/20 bg-black/50 px-3 py-1.5 text-xs text-amber-200/90 backdrop-blur-md">
            <WarningCircle size={14} />
            <span className="max-w-[min(70vw,24rem)] truncate">{softPinnedWarning}</span>
            <button
              type="button"
              onClick={() => config && loadPinned(config)}
              className="shrink-0 text-[var(--cobalt)] underline-offset-2 hover:underline"
            >
              重试
            </button>
          </div>
        )}

        <div
          className="animate-newtab-enter flex flex-1 flex-col items-center justify-start gap-8 px-6"
          style={{ paddingTop: centerPadTop, paddingBottom: "7.5rem" }}
        >
          <Clock density={config.clockDensity} />
          <div className="h-0.5 w-18 rounded-full bg-[var(--shift-track)]" aria-hidden />
          <SearchBox
            engines={config.searchEngines}
            defaultEngineId={initialEngineId}
            openInNewTab={config.openInNewTab}
            enterBehavior={config.enterBehavior}
            recents={recents}
            onSearchBookmarks={handleSearchBookmarks}
            onOpenBookmark={handleOpenBookmark}
            onEngineChange={handleEngineChange}
            onOpenSettings={openSettings}
          />
        </div>

        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
          <Suspense fallback={null}>
            <Dock
              bookmarks={pinned}
              loading={pinnedLoading}
              error={hardPinnedError}
              openInNewTab={config.openInNewTab}
              siteUrl={config.apiBaseUrl}
              onOpenBookmark={handleOpenBookmark}
              onOpenSettings={openSettings}
              onRetry={() => loadPinned(config)}
            />
          </Suspense>
        </div>
      </div>
    </>
  );
}

/** 根据背景配置解析主图与离线回退图。 */
function resolveBackgroundSources(
  bg: ExtConfig["background"],
  localImage: string | null
): { primary: string; fallback: string | null } {
  if (bg.type === "none") return { primary: "", fallback: null };
  if (bg.type === "upload") return { primary: localImage ?? "", fallback: null };
  // url：网络主图 + 本地上传作回退
  const primary = bg.url.trim();
  const fallback = localImage?.trim() ? localImage : null;
  return { primary, fallback };
}

/**
 * 背景层：优先显示 url；加载失败 / 超时则回退 fallback（本地 dataURL）。
 */
function BackgroundLayer({
  url,
  fallbackUrl,
  blur,
  dim,
}: {
  url: string;
  fallbackUrl?: string | null;
  blur: number;
  dim: number;
}) {
  const [activeUrl, setActiveUrl] = useState(url || fallbackUrl || "");

  useEffect(() => {
    let cancelled = false;
    const primary = url.trim();
    const fallback = fallbackUrl?.trim() || "";

    if (!primary) {
      setActiveUrl(fallback);
      return;
    }

    // dataURL / blob 无需探测
    if (primary.startsWith("data:") || primary.startsWith("blob:")) {
      setActiveUrl(primary);
      return;
    }

    // 先乐观显示主图；失败再换回退，避免闪白
    setActiveUrl(primary);

    const img = new Image();
    const timeoutMs = 8000;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (fallback) setActiveUrl(fallback);
    }, timeoutMs);

    img.onload = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      setActiveUrl(primary);
    };
    img.onerror = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      setActiveUrl(fallback || "");
    };
    // 跨域图片仍可触发 load/error（不读像素即可）
    img.referrerPolicy = "no-referrer";
    img.src = primary;

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      img.src = "";
    };
  }, [url, fallbackUrl]);

  if (!activeUrl) return null;

  return (
    <div className="bg-layer" aria-hidden>
      <div
        className="bg-layer-image"
        style={{
          backgroundImage: `url("${activeUrl}")`,
          filter: blur > 0 ? `blur(${blur}px)` : undefined,
          transform: blur > 0 ? "scale(1.1)" : undefined,
        }}
      />
      {dim > 0 && <div className="bg-layer-dim" style={{ opacity: dim }} />}
    </div>
  );
}
