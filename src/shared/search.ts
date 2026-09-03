/**
 * 跨端搜索引擎契约：类型、默认值与纯函数。
 * Web 启动台与 Worker 设置共用。
 */

/** 搜索引擎定义。url 中 {query} 为占位符。 */
export type SearchEngine = {
  id: string;
  name: string;
  /** 搜索 URL，含 {query} 占位符。 */
  url: string;
  /** 用于 UI 展示的图标 URL（可选，缺省取 favicon）。 */
  iconUrl?: string;
  /** 是否为内置（内置项不可删除，仅可编辑）。 */
  builtin: boolean;
};

export const DEFAULT_SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={query}', builtin: true },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={query}', builtin: true },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd={query}', builtin: true },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}', builtin: true },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q={query}', builtin: true },
];

/** 内置 bang 别名 → 引擎 id。 */
export const ENGINE_BANG_ALIASES: Record<string, string> = {
  g: 'google',
  google: 'google',
  b: 'bing',
  bing: 'bing',
  bd: 'baidu',
  baidu: 'baidu',
  d: 'duckduckgo',
  ddg: 'duckduckgo',
  duck: 'duckduckgo',
  duckduckgo: 'duckduckgo',
  gh: 'github',
  github: 'github',
};

/** 构造搜索 URL。 */
export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.url.replace('{query}', encodeURIComponent(query));
}

/** 根据 origin 拼接 favicon 代理 URL（与后端默认代理一致）。 */
export function faviconFor(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/** 从 URL 提取域名。 */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
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
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?(\/[^\s]*)?$/i.test(
    q,
  );
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
  const rest = (m[2] ?? '').trim();

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
