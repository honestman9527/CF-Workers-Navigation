/**
 * Popup - 快速将当前页收藏到 Nav。
 * 分类选择对齐 Web 端 CategoryPicker（树形展开 + 路径搜索）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bookmark as BookmarkSimple,
  Check,
  Globe,
  Pin as PushPin,
  RefreshCw as ArrowsClockwise,
  Settings as Gear,
  TriangleAlert as Warning,
} from "lucide-react";
import {
  getConfig,
  getLastCategoryId,
  setLastCategoryId,
  resolveDefaultCategory,
  notifyBookmarksChanged,
} from "@ext/shared/storage";
import { hasHostPermission, ensureHostPermission } from "@ext/shared/permissions";
import { api, ApiError } from "@ext/shared/api/client";
import { faviconFor, domainOf, type ExtConfig } from "@ext/shared/config";
import type { CategoryNode, MetadataPreview } from "@ext/shared/api/types";
import { CategoryPicker } from "./components/CategoryPicker";

type PopupState =
  | "loading"
  | "not-configured"
  | "unsupported"
  | "no-permission"
  | "error"
  | "ready"
  | "submitting"
  | "success"
  | "create-error";

function originOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return "";
  }
}

function isUnsupportedUrl(url: string): boolean {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")
  );
}

export default function App() {
  const [state, setState] = useState<PopupState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [tabUrl, setTabUrl] = useState("");
  const [tabTitle, setTabTitle] = useState("");
  const [metadata, setMetadata] = useState<MetadataPreview | null>(null);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const configRef = useRef<ExtConfig | null>(null);

  const init = useCallback(async () => {
    setState("loading");
    setErrorMsg("");
    try {
      const [cfg, tabs] = await Promise.all([
        getConfig(),
        chrome.tabs.query({ active: true, currentWindow: true }),
      ]);
      configRef.current = cfg;
      const tab = tabs[0];
      if (!tab?.url) {
        setState("unsupported");
        return;
      }
      const url = tab.url;
      const titleFromTab = tab.title || "";

      if (!cfg.apiBaseUrl || !cfg.adminToken) {
        setTabUrl(url);
        setTabTitle(titleFromTab);
        setState("not-configured");
        return;
      }

      if (isUnsupportedUrl(url)) {
        setTabUrl(url);
        setTabTitle(titleFromTab);
        setState("unsupported");
        return;
      }

      const origin = originOf(cfg.apiBaseUrl);
      if (origin) {
        const hasPerm = await hasHostPermission(origin);
        if (!hasPerm) {
          setTabUrl(url);
          setTabTitle(titleFromTab);
          setState("no-permission");
          return;
        }
      }

      let meta: MetadataPreview | null = null;
      let catNodes: CategoryNode[] = [];

      try {
        const [m, c] = await Promise.all([
          api.getMetadata(cfg.apiBaseUrl, cfg.adminToken, url),
          api.getCategories(cfg.apiBaseUrl, cfg.adminToken),
        ]);
        meta = m;
        catNodes = c;
      } catch (e) {
        try {
          catNodes = await api.getCategories(cfg.apiBaseUrl, cfg.adminToken);
        } catch {
          setErrorMsg(e instanceof ApiError ? e.message : "获取数据失败");
          setTabUrl(url);
          setTabTitle(titleFromTab);
          setState("error");
          return;
        }
        meta = null;
      }

      setCategoryTree(catNodes);
      setMetadata(meta);
      setTabUrl(url);
      setTabTitle(titleFromTab);
      setTitle(meta?.title || titleFromTab || domainOf(url));
      setDescription(meta?.description || "");
      setIsPinned(false);

      // 优先上次使用的分类（与右键收藏共享），否则第一个根分类
      const lastCategoryId = await getLastCategoryId();
      const defaultNode = resolveDefaultCategory(catNodes, lastCategoryId);
      setSelectedCategoryId(defaultNode?.id ?? null);

      setState("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "初始化失败");
      setState("error");
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  const handlePermissionRequest = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg) return;
    const origin = originOf(cfg.apiBaseUrl);
    if (!origin) return;
    const ok = await ensureHostPermission(origin);
    if (ok) init();
  }, [init]);

  const handleSubmit = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg?.apiBaseUrl || !cfg.adminToken || selectedCategoryId === null) return;

    const trimmedTitle = title.trim() || tabTitle || domainOf(tabUrl);
    const iconUrl = metadata?.iconUrl || faviconFor(domainOf(tabUrl));

    setState("submitting");
    try {
      await api.createBookmark(cfg.apiBaseUrl, cfg.adminToken, {
        categoryId: selectedCategoryId,
        title: trimmedTitle,
        url: tabUrl,
        description: description.trim() || null,
        iconUrl,
        isPinned,
      });
      await setLastCategoryId(selectedCategoryId);
      notifyBookmarksChanged({ affectsPinned: isPinned });
      setState("success");
    } catch (e) {
      setErrorMsg(e instanceof ApiError ? e.message : "创建失败");
      setState("create-error");
    }
  }, [title, description, tabUrl, tabTitle, metadata, selectedCategoryId, isPinned]);

  const handleReset = useCallback(() => {
    setState("ready");
    setErrorMsg("");
  }, []);

  const handleFinish = useCallback(() => {
    window.close();
  }, []);

  // ---- Loading ----
  if (state === "loading") {
    return (
      <div className="flex items-center justify-center p-8">
        <ArrowsClockwise className="h-5 w-5 animate-spin text-[rgb(var(--accent))]" />
      </div>
    );
  }

  // ---- Not configured ----
  if (state === "not-configured") {
    return (
      <div className="glass-card m-3 animate-fade-in">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Warning className="h-8 w-8 text-amber-400" />
          <p className="text-sm text-[var(--text-primary)]">请先在设置中配置 API 地址和管理员密码</p>
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            <Gear className="h-4 w-4" />
            打开设置
          </button>
        </div>
      </div>
    );
  }

  // ---- Unsupported ----
  if (state === "unsupported") {
    return (
      <div className="glass-card m-3 animate-fade-in">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Globe className="h-8 w-8 text-[var(--text-secondary)]" />
          <p className="text-sm text-[var(--text-primary)]">此页面无法收藏</p>
          <p className="max-w-full truncate text-xs text-[var(--text-secondary)]">{tabUrl}</p>
        </div>
      </div>
    );
  }

  // ---- No permission ----
  if (state === "no-permission") {
    return (
      <div className="glass-card m-3 animate-fade-in">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Warning className="h-8 w-8 text-amber-400" />
          <p className="text-sm text-[var(--text-primary)]">需要授权才能连接 API 服务器</p>
          <button type="button" className="btn-primary text-sm" onClick={handlePermissionRequest}>
            授权访问
          </button>
        </div>
      </div>
    );
  }

  // ---- Error ----
  if (state === "error") {
    return (
      <div className="glass-card m-3 animate-fade-in">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Warning className="h-8 w-8 text-[var(--destructive)]" />
          <p className="text-sm text-[var(--text-primary)]">{errorMsg}</p>
          <button type="button" className="btn-secondary text-sm" onClick={init}>
            <ArrowsClockwise className="h-4 w-4" />
            重试
          </button>
        </div>
      </div>
    );
  }

  // ---- Success ----
  if (state === "success") {
    return (
      <div className="glass-card m-3 animate-fade-in">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--verdigris)_15%,transparent)]">
            <Check className="h-5 w-5 text-[var(--verdigris)]" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">已收藏</p>
          <button type="button" className="btn-primary text-sm" onClick={handleFinish}>
            完成
          </button>
        </div>
      </div>
    );
  }

  // ---- Create error ----
  if (state === "create-error") {
    return (
      <div className="glass-card m-3 animate-fade-in">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Warning className="h-8 w-8 text-[var(--destructive)]" />
          <p className="text-sm text-[var(--text-primary)]">{errorMsg}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={handleReset}>
              返回
            </button>
            <button type="button" className="btn-primary text-sm" onClick={handleSubmit}>
              <ArrowsClockwise className="h-4 w-4" />
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Ready (form) ----
  const domain = domainOf(tabUrl);
  const displayIcon = metadata?.iconUrl || faviconFor(domain);
  const canSubmit =
    title.trim().length > 0 && selectedCategoryId !== null && categoryTree.length > 0;

  return (
    <div className="animate-fade-in">
      <div className="relative flex items-center justify-between border-b border-[var(--border-color)] px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
          <BookmarkSimple className="h-4 w-4 text-[var(--lacquer)]" />
          快速收藏
        </span>
        <span className="absolute top-10 left-4 h-0.5 w-14 rounded-full bg-[var(--shift-track)]" aria-hidden />
        <button
          type="button"
          className="btn-icon text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          onClick={() => chrome.runtime.openOptionsPage()}
          title="设置"
          aria-label="打开设置"
        >
          <Gear className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 p-4">
        {/* 当前页摘要 */}
        <div className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-muted)] p-3">
          <img
            src={displayIcon}
            alt=""
            className="h-8 w-8 shrink-0 rounded"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = faviconFor(domain);
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)]">
              {tabTitle || domain}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-[var(--text-secondary)]">{domain}</p>
            {metadata?.partial ? (
              <p className="mt-1.5 text-xs text-amber-400/90">
                未能自动抓取完整信息，请核对标题与描述
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]" htmlFor="popup-title">
            标题
          </label>
          <input
            id="popup-title"
            className="input w-full"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="页面标题"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]" htmlFor="popup-desc">
            描述
          </label>
          <textarea
            id="popup-desc"
            className="input w-full resize-none"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="添加描述（可选）"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]" htmlFor="popup-cat">
            分类
          </label>
          {categoryTree.length > 0 ? (
            <CategoryPicker
              id="popup-cat"
              categories={categoryTree}
              value={selectedCategoryId}
              onChange={setSelectedCategoryId}
              placeholder="选择要放入的分类"
            />
          ) : (
            <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-color)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
              暂无分类，请先在 Web 端新建。
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-muted)]/60 px-3 py-2.5 transition-colors hover:bg-[var(--bg-muted)]">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
          />
          <PushPin
            className={`h-4 w-4 ${isPinned ? "fill-current text-amber-500" : "text-[var(--text-secondary)]"}`}
          />
          <span className="text-sm text-[var(--text-primary)]">置顶到新标签页 Dock</span>
        </label>

        <button
          type="button"
          className="btn-primary w-full"
          disabled={!canSubmit || state === "submitting"}
          onClick={handleSubmit}
        >
          {state === "submitting" ? (
            <ArrowsClockwise className="h-4 w-4 animate-spin" />
          ) : (
            <BookmarkSimple className="h-4 w-4" />
          )}
          {state === "submitting" ? "添加中…" : "添加"}
        </button>
      </div>
    </div>
  );
}
