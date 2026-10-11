export type SearchMode = 'site' | 'web';
export type NavigationSearch = {
  mode?: SearchMode;
  q?: string;
  engine?: string;
  category?: string;
  tag?: string;
  untagged?: boolean;
};

export const SEARCH_MODE_KEY = 'nav-search-mode';

export function parseNavigationSearch(raw: Record<string, unknown>): NavigationSearch {
  const search: NavigationSearch = {};
  if (raw.mode === 'site' || raw.mode === 'web') search.mode = raw.mode;
  for (const key of ['q', 'engine', 'category', 'tag'] as const) {
    const value = raw[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const text = String(value).trim();
      if (text) search[key] = text;
    }
  }
  if (
    !search.tag &&
    (raw.untagged === true || raw.untagged === 1 || raw.untagged === '1' || raw.untagged === 'true')
  )
    search.untagged = true;
  return search;
}

export function readSearchMode(): SearchMode {
  try {
    return localStorage.getItem(SEARCH_MODE_KEY) === 'web' ? 'web' : 'site';
  } catch {
    return 'site';
  }
}

export function saveSearchMode(mode: SearchMode) {
  try {
    localStorage.setItem(SEARCH_MODE_KEY, mode);
  } catch {
    /* optional preference */
  }
}

export function legacyNavigationSearch(
  raw: Record<string, unknown>,
  mode: SearchMode,
): NavigationSearch {
  return parseNavigationSearch({ ...raw, mode });
}
