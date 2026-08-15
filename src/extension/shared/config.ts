/**
 * 扩展配置类型与默认值。
 * 类型放在这里、默认值也放在这里，storage.ts / api client / UI 共用。
 */

import type { Bookmark } from "./api/types";

/** 搜索引擎定义。url 中 {query} 为占位符。 */
export type SearchEngine = {
  id: string;
  name: string;
  /** 搜索 URL，含 {query} 占位符。 */
  url: string;
  /** 用于 UI 展示的图标 URL（可选，缺省取 favicon）。 */
  iconUrl?: string;
  /** 是否为内置（内置项不可删除，仅可禁用/编辑）。 */
  builtin: boolean;
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
  theme: 'light' | 'dark';
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

export const DEFAULT_SEARCH_ENGINES: SearchEngine[] = [
  { id: "google", name: "Google", url: "https://www.google.com/search?q={query}", builtin: true },
  { id: "bing", name: "Bing", url: "https://www.bing.com/search?q={query}", builtin: true },
  { id: "baidu", name: "百度", url: "https://www.baidu.com/s?wd={query}", builtin: true },
  { id: "duckduckgo", name: "DuckDuckGo", url: "https://duckduckgo.com/?q={query}", builtin: true },
  { id: "github", name: "GitHub", url: "https://github.com/search?q={query}", builtin: true },
];

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

/** 内置 bang 别名 → 引擎 id。 */
export const ENGINE_BANG_ALIASES: Record<string, string> = {
  g: "google",
  google: "google",
  b: "bing",
  bing: "bing",
  bd: "baidu",
  baidu: "baidu",
  d: "duckduckgo",
  ddg: "duckduckgo",
  duck: "duckduckgo",
  duckduckgo: "duckduckgo",
  gh: "github",
  github: "github",
};

/** 构造搜索 URL。 */
export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.url.replace("{query}", encodeURIComponent(query));
}

/** 根据 origin 拼接 favicon 代理 URL（与后端默认代理一致）。 */
export function faviconFor(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/** 从 URL 提取域名。 */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** 优先书签自带 iconUrl，否则回退域名 favicon。 */
export function resolveBookmarkIcon(iconUrl: string | null | undefined, pageUrl: string): string {
  const trimmed = iconUrl?.trim();
  if (trimmed) return trimmed;
  return faviconFor(domainOf(pageUrl));
}

/**
 * 判断输入是否像可直接导航的 URL / 域名。
 * 含空格则否；支持 http(s)、localhost、IPv4、domain.tld[/path]。
 */
export function looksLikeUrl(input: string): boolean {
  const q = input.trim();
  if (!q || /\s/.test(q)) return false;
  if (/^https?:\/\//i.test(q)) return true;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(q)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(q)) return true;
  // 至少一段点分域名，TLD ≥ 2
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?(\/[^\s]*)?$/i.test(q);
}

/** 补全协议，供地址栏式直达。 */
export function normalizeNavigateUrl(input: string): string {
  const q = input.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(q)) return q;
  return `https://${q}`;
}

export type BangParseResult = {
  /** 去掉 bang 后的查询（可为空）。 */
  query: string;
  /** 解析到的引擎 id。 */
  engineId?: string;
  /** 原始 bang token（小写）。 */
  bang?: string;
};

/**
 * 解析 `!g 关键词` 形式的 bang。
 * 未匹配时返回原 query，不改引擎。
 */
export function parseBangQuery(raw: string, engines: SearchEngine[]): BangParseResult {
  const trimmed = raw.trim();
  const m = trimmed.match(/^!([a-zA-Z0-9_-]+)(?:\s+(.*))?$/s);
  if (!m) return { query: trimmed };

  const token = m[1].toLowerCase();
  const rest = (m[2] ?? "").trim();

  const byAlias = ENGINE_BANG_ALIASES[token];
  if (byAlias && engines.some((e) => e.id === byAlias)) {
    return { query: rest, engineId: byAlias, bang: token };
  }

  const byId = engines.find((e) => e.id.toLowerCase() === token);
  if (byId) return { query: rest, engineId: byId.id, bang: token };

  const byName = engines.find((e) => e.name.toLowerCase() === token);
  if (byName) return { query: rest, engineId: byName.id, bang: token };

  // 未知 bang：当作普通查询（保留 !）
  return { query: trimmed };
}

/**
 * 本地书签检索（个人量级足够）。
 * 全 token 匹配 title/url/description，按相关度排序。
 */
export function searchBookmarksLocal(
  bookmarks: Bookmark[],
  query: string,
  limit = 8
): Bookmark[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const scored: { bm: Bookmark; score: number }[] = [];

  for (const bm of bookmarks) {
    const title = bm.title.toLowerCase();
    const url = bm.url.toLowerCase();
    const host = domainOf(bm.url).toLowerCase();
    const desc = (bm.description ?? "").toLowerCase();

    let score = 0;
    let ok = true;
    for (const t of tokens) {
      if (title === t) score += 100;
      else if (title.startsWith(t)) score += 55;
      else if (title.includes(t)) score += 35;
      else if (host.startsWith(t) || host.includes(t)) score += 28;
      else if (url.includes(t)) score += 18;
      else if (desc.includes(t)) score += 10;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ bm, score });
  }

  scored.sort((a, b) => b.score - a.score || a.bm.title.localeCompare(b.bm.title));
  return scored.slice(0, limit).map((s) => s.bm);
}
