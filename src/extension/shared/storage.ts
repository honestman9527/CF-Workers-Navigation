import { DEFAULT_CONFIG } from "./config";
import type { ExtConfig, BackgroundConfig, EnterBehavior, ClockDensity } from "./config";
import type { Bookmark, CategoryNode } from "./api/types";

export const STORAGE_KEY = "nav_ext_config";
export const BG_IMAGE_KEY = "nav_ext_bg_image";
export const LAST_CATEGORY_KEY = "nav_ext_last_category";
export const RECENT_KEY = "nav_ext_recent";
export const RECENT_MAX = 8;
export const LAST_ENGINE_KEY = "nav_ext_last_engine";
export const BOOKMARKS_CACHE_KEY = "nav_ext_bookmarks_cache";
export const CACHE_FRESH_MS = 60_000;

type TimedApiCache = { ts: number; apiBaseUrl: string; authToken: string };

export function isCacheForScope(
  cache: TimedApiCache | null | undefined,
  apiBaseUrl: string,
  authToken: string,
): boolean {
  return Boolean(
    cache && cache.apiBaseUrl === apiBaseUrl && cache.authToken === authToken,
  );
}

export function isCacheFresh(
  cache: TimedApiCache | null | undefined,
  apiBaseUrl: string,
  authToken: string,
  now = Date.now(),
  maxAge = CACHE_FRESH_MS,
): boolean {
  return Boolean(
    isCacheForScope(cache, apiBaseUrl, authToken) &&
      cache &&
      cache.ts <= now &&
      now - cache.ts < maxAge,
  );
}

/** 书签变更广播（popup / 右键收藏成功后通知新标签页刷新 Dock 等）。 */
export const MSG_BOOKMARKS_CHANGED = "nav:bookmarks-changed" as const;

export type BookmarksChangedMessage = {
  type: typeof MSG_BOOKMARKS_CHANGED;
  /** 是否可能影响置顶 Dock（创建时勾选了置顶，或改动了 pinned 状态）。 */
  affectsPinned?: boolean;
};

/**
 * 扩展端配置存储 helper。
 * 配置写入 chrome.storage.sync（跨设备同步），
 * 新标签页 / 选项页 / service worker 三处共享同一份配置。
 */

/** 读取完整配置，与默认配置合并。 */
export async function getConfig(): Promise<ExtConfig> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const stored = (result[STORAGE_KEY] ?? {}) as Partial<ExtConfig>;
  return mergeConfig(DEFAULT_CONFIG, stored);
}

/** 写入完整配置。 */
export async function setConfig(config: ExtConfig): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: config });
}

/** 增量更新部分字段。 */
export async function updateConfig(patch: Partial<ExtConfig>): Promise<ExtConfig> {
  const current = await getConfig();
  const next = mergeConfig(current, patch);
  await setConfig(next);
  return next;
}

/** 监听配置变化（用于多页面同步）。 */
export function onConfigChange(cb: (config: ExtConfig) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string
  ) => {
    if (area === "sync" && changes[STORAGE_KEY]) {
      const next = changes[STORAGE_KEY].newValue as ExtConfig | undefined;
      if (next) cb(next);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function mergeConfig(base: ExtConfig, patch: Partial<ExtConfig>): ExtConfig {
  return {
    apiBaseUrl: patch.apiBaseUrl ?? base.apiBaseUrl,
    adminToken: patch.adminToken ?? base.adminToken,
    theme: isTheme(patch.theme) ? patch.theme : base.theme,
    searchEngines:
      Array.isArray(patch.searchEngines) && patch.searchEngines.length > 0
        ? patch.searchEngines
        : base.searchEngines,
    defaultEngineId: patch.defaultEngineId ?? base.defaultEngineId,
    background: mergeBackground(base.background, patch.background),
    openInNewTab:
      typeof patch.openInNewTab === "boolean" ? patch.openInNewTab : base.openInNewTab,
    enterBehavior: isEnterBehavior(patch.enterBehavior) ? patch.enterBehavior : base.enterBehavior,
    rememberLastEngine:
      typeof patch.rememberLastEngine === "boolean"
        ? patch.rememberLastEngine
        : base.rememberLastEngine,
    clockDensity: isClockDensity(patch.clockDensity) ? patch.clockDensity : base.clockDensity,
  };
}

function isTheme(v: unknown): v is 'light' | 'dark' {
  return v === 'light' || v === 'dark';
}

function isEnterBehavior(v: unknown): v is EnterBehavior {
  return v === "bookmark" || v === "web";
}

function isClockDensity(v: unknown): v is ClockDensity {
  return v === "full" || v === "compact" || v === "hidden";
}

function mergeBackground(base: BackgroundConfig, patch?: Partial<BackgroundConfig>): BackgroundConfig {
  if (!patch) return { ...base };
  return {
    type: patch.type ?? base.type,
    url: patch.url ?? base.url,
    blur: typeof patch.blur === "number" ? patch.blur : base.blur,
    dim: typeof patch.dim === "number" ? patch.dim : base.dim,
  };
}

/* ---- 本地上传背景图（存 chrome.storage.local，因体积可能超 sync 8KB 限制）---- */

const BG_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8MB

/** 读取本地上传背景图 dataURL。 */
export async function getBackgroundImage(): Promise<string | null> {
  const result = await chrome.storage.local.get(BG_IMAGE_KEY);
  return (result[BG_IMAGE_KEY] as string | undefined) ?? null;
}

/** 写入本地上传背景图 dataURL（体积过大时抛错）。 */
export async function setBackgroundImage(dataUrl: string): Promise<void> {
  if (dataUrl.length > BG_IMAGE_MAX_BYTES) {
    throw new Error("图片过大，请选择小于 8MB 的图片");
  }
  await chrome.storage.local.set({ [BG_IMAGE_KEY]: dataUrl });
}

/** 清除本地上传背景图。 */
export async function clearBackgroundImage(): Promise<void> {
  await chrome.storage.local.remove(BG_IMAGE_KEY);
}

/* ---- Dock 置顶书签本地缓存（chrome.storage.local，用于离线兜底）---- */

export const PINNED_CACHE_KEY = "nav_ext_pinned_cache";

export type PinnedCache = {
  data: Bookmark[];
  ts: number;
  apiBaseUrl: string;
  authToken: string;
};

/** 读取 dock 置顶书签缓存。 */
export async function getPinnedCache(): Promise<PinnedCache | null> {
  const result = await chrome.storage.local.get(PINNED_CACHE_KEY);
  return (result[PINNED_CACHE_KEY] as PinnedCache | undefined) ?? null;
}

/** 写入 dock 置顶书签缓存（请求成功后刷新）。 */
export async function setPinnedCache(
  apiBaseUrl: string,
  authToken: string,
  data: Bookmark[],
): Promise<void> {
  const cache: PinnedCache = { data, ts: Date.now(), apiBaseUrl, authToken };
  await chrome.storage.local.set({ [PINNED_CACHE_KEY]: cache });
}

/** 清除 dock 置顶书签缓存。 */
export async function clearPinnedCache(): Promise<void> {
  await chrome.storage.local.remove(PINNED_CACHE_KEY);
}

/* ---- 上次使用的分类（popup / 右键收藏共享）---- */

/** 读取上次收藏使用的分类 id。 */
export async function getLastCategoryId(): Promise<number | null> {
  const result = await chrome.storage.local.get(LAST_CATEGORY_KEY);
  const id = result[LAST_CATEGORY_KEY];
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/** 写入上次收藏使用的分类 id。 */
export async function setLastCategoryId(id: number): Promise<void> {
  await chrome.storage.local.set({ [LAST_CATEGORY_KEY]: id });
}

/**
 * 在分类树中解析默认分类：优先上次使用的 id，否则第一个根分类，再否则扁平第一项。
 */
export function resolveDefaultCategory(
  nodes: CategoryNode[],
  lastCategoryId: number | null
): CategoryNode | null {
  if (lastCategoryId !== null) {
    const found = findCategoryById(nodes, lastCategoryId);
    if (found) return found;
  }
  return nodes.find((c) => c.parentId === null) ?? nodes[0] ?? null;
}

function findCategoryById(nodes: CategoryNode[], id: number): CategoryNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findCategoryById(node.children, id);
    if (child) return child;
  }
  return null;
}

/**
 * 通知扩展内其它页面（如已打开的新标签页）书签数据已变更。
 * 无监听方时 chrome.runtime.lastError 可忽略。
 */
export function notifyBookmarksChanged(options?: { affectsPinned?: boolean }): void {
  const message: BookmarksChangedMessage = {
    type: MSG_BOOKMARKS_CHANGED,
    affectsPinned: options?.affectsPinned,
  };
  const cacheKeys = options?.affectsPinned
    ? [BOOKMARKS_CACHE_KEY, PINNED_CACHE_KEY]
    : [BOOKMARKS_CACHE_KEY];

  const send = () => {
    try {
      chrome.runtime.sendMessage(message, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // service worker / popup 关闭过程中可能抛错，忽略
    }
  };

  void chrome.storage.local.remove(cacheKeys).then(send, send);
}

/* ---- 最近打开（本地，供新标签页空查询快捷入口）---- */

export type RecentItem = {
  /** 书签 id（若从书签打开可知）。 */
  id?: number;
  title: string;
  url: string;
  iconUrl?: string | null;
  ts: number;
};

export function mergeRecentItems(
  previous: RecentItem[],
  item: Omit<RecentItem, "ts"> & { ts?: number },
  now = Date.now(),
): RecentItem[] {
  const nextItem: RecentItem = {
    id: item.id,
    title: item.title,
    url: item.url,
    iconUrl: item.iconUrl ?? null,
    ts: item.ts ?? now,
  };
  return [nextItem, ...previous.filter((recent) => recent.url !== nextItem.url)].slice(0, RECENT_MAX);
}

/** 读取最近打开列表（按时间倒序）。 */
export async function getRecentItems(): Promise<RecentItem[]> {
  const result = await chrome.storage.local.get(RECENT_KEY);
  const list = result[RECENT_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isRecentItem).slice(0, RECENT_MAX);
}

/** 写入一条最近打开（按 url 去重置顶）。 */
export async function pushRecentItem(
  item: Omit<RecentItem, "ts"> & { ts?: number }
): Promise<RecentItem[]> {
  const prev = await getRecentItems();
  const deduped = mergeRecentItems(prev, item);
  await chrome.storage.local.set({ [RECENT_KEY]: deduped });
  return deduped;
}

function isRecentItem(v: unknown): v is RecentItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.title === "string" && typeof o.url === "string" && typeof o.ts === "number";
}

/* ---- 上次搜索引擎（local，配合 rememberLastEngine）---- */

/** 读取上次选用的搜索引擎 id。 */
export async function getLastEngineId(): Promise<string | null> {
  const result = await chrome.storage.local.get(LAST_ENGINE_KEY);
  const id = result[LAST_ENGINE_KEY];
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** 写入上次选用的搜索引擎 id。 */
export async function setLastEngineId(id: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_ENGINE_KEY]: id });
}

/* ---- 全量书签本地缓存（local 搜索 / 离线兜底）---- */

export type BookmarksCache = {
  data: Bookmark[];
  ts: number;
  apiBaseUrl: string;
  authToken: string;
};

/** 读取全量书签缓存。 */
export async function getBookmarksCache(): Promise<BookmarksCache | null> {
  const result = await chrome.storage.local.get(BOOKMARKS_CACHE_KEY);
  const cache = result[BOOKMARKS_CACHE_KEY] as BookmarksCache | undefined;
  if (!cache || !Array.isArray(cache.data) || typeof cache.apiBaseUrl !== "string") return null;
  return cache;
}

/** 写入全量书签缓存。 */
export async function setBookmarksCache(
  apiBaseUrl: string,
  authToken: string,
  data: Bookmark[],
): Promise<void> {
  const cache: BookmarksCache = { data, ts: Date.now(), apiBaseUrl, authToken };
  await chrome.storage.local.set({ [BOOKMARKS_CACHE_KEY]: cache });
}

/** 清除全量书签缓存。 */
export async function clearBookmarksCache(): Promise<void> {
  await chrome.storage.local.remove(BOOKMARKS_CACHE_KEY);
}
