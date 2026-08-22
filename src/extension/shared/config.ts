/**
 * 扩展配置类型与默认值。
 * 类型放在这里、默认值也放在这里，storage.ts / api client / UI 共用。
 *
 * SearchEngine 与搜索引擎纯函数来自共享契约 `@shared/search`，
 * 此处 re-export 保持历史导入路径 `@ext/shared/config` 不变。
 */

import {
  type SearchEngine,
  DEFAULT_SEARCH_ENGINES,
  ENGINE_BANG_ALIASES,
  buildSearchUrl,
  faviconFor,
  domainOf,
  resolveBookmarkIcon,
  looksLikeUrl,
  normalizeNavigateUrl,
  type BangParseResult,
  parseBangQuery,
} from "@shared/search";

export {
  type SearchEngine,
  DEFAULT_SEARCH_ENGINES,
  ENGINE_BANG_ALIASES,
  buildSearchUrl,
  faviconFor,
  domainOf,
  resolveBookmarkIcon,
  looksLikeUrl,
  normalizeNavigateUrl,
  type BangParseResult,
  parseBangQuery,
};

/** 背景图配置（小体积偏好，写入 chrome.storage.sync）。 */
export type BackgroundConfig = {
  /** 背景类型。 */
  type: "none" | "url" | "upload";
  /** 网络图片地址（type === "url" 时使用）。 */
  url: string;
  /** 背景模糊度 (px)，0 表示不模糊。 */
  blur: number;
  /** 遮罩透明度 0~1，0 表示无遮罩。 */
  dim: number;
};

/** 回车无高亮时的默认行为。 */
export type EnterBehavior = "bookmark" | "web";

/** 新标签页时钟密度。 */
export type ClockDensity = "full" | "compact" | "hidden";

/** 扩展持久化配置（写入 chrome.storage.sync）。 */
export type ExtConfig = {
  /** 后端 API 基地址，如 https://nav.example.com。 */
  apiBaseUrl: string;
  /** 管理员密码（Bearer token）。 */
  adminToken: string;
  /** 界面主题。 */
  theme: "light" | "dark";
  /** 搜索引擎列表。 */
  searchEngines: SearchEngine[];
  /** 默认搜索引擎 id。 */
  defaultEngineId: string;
  /** 背景图配置。 */
  background: BackgroundConfig;
  /**
   * 是否在新标签打开链接。
   * 默认 false：在当前新标签页内跳转（更符合个人启动页心智）。
   * Ctrl/Cmd+点击 或 中键 始终新标签。
   */
  openInNewTab: boolean;
  /**
   * 搜索框回车且无键盘高亮时：
   * - bookmark：有书签结果则打开第一条，否则网页搜索
   * - web：始终网页搜索
   */
  enterBehavior: EnterBehavior;
  /** 记住上次选用的搜索引擎（存 local）。默认 true。 */
  rememberLastEngine: boolean;
  /** 时钟展示密度。默认 full。 */
  clockDensity: ClockDensity;
};

export const DEFAULT_BACKGROUND: BackgroundConfig = {
  type: "none",
  url: "",
  blur: 0,
  dim: 0.35,
};

export const DEFAULT_CONFIG: ExtConfig = {
  apiBaseUrl: "",
  adminToken: "",
  theme: "dark",
  searchEngines: DEFAULT_SEARCH_ENGINES,
  defaultEngineId: "google",
  background: DEFAULT_BACKGROUND,
  openInNewTab: false,
  enterBehavior: "bookmark",
  rememberLastEngine: true,
  clockDensity: "full",
};