/** 工作区只保留一个导航条件；搜索词独立，清空后恢复该导航位置。 */
export type WorkspaceSearch = {
  category?: string;
  tag?: string;
  untagged?: boolean;
  /** 兼容旧常用入口链接。 */
  pinned?: boolean;
  q?: string;
};

function rawString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  // 路由解析器会将纯数字、布尔字符串转成相应类型。
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function isTrue(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** 旧组合链接按分类、标签、无标签、置顶的优先级收敛；忽略旧 view 参数。 */
export function parseWorkspaceSearch(search: Record<string, unknown>): WorkspaceSearch {
  const result: WorkspaceSearch = {};
  const category = rawString(search.category);
  const tag = rawString(search.tag);
  if (category) result.category = category;
  else if (tag) result.tag = tag;
  else if (isTrue(search.untagged)) result.untagged = true;
  else if (isTrue(search.pinned)) result.pinned = true;
  const q = rawString(search.q);
  if (q) result.q = q;
  return result;
}

/** 导航替换整个查询状态，清除原来的筛选和搜索词。空对象代表全部网站。 */
export function selectWorkspaceFilter(filter: Omit<WorkspaceSearch, 'q'>): WorkspaceSearch {
  const search = parseWorkspaceSearch(filter);
  delete search.q;
  return search;
}

export function setWorkspaceQuery(search: WorkspaceSearch, query: string): WorkspaceSearch {
  return parseWorkspaceSearch({ ...search, q: query });
}

/** 比较路由解码后的值，兼容数字/布尔查询词，避免规范化重定向循环。 */
export function isCanonicalWorkspaceSearch(
  raw: Record<string, unknown>,
  search: WorkspaceSearch,
): boolean {
  const entries = Object.entries(raw);
  return (
    entries.length === Object.keys(search).length &&
    entries.every(
      ([key, value]) =>
        (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
        Object.hasOwn(search, key) &&
        String(value) === String(search[key as keyof WorkspaceSearch]),
    )
  );
}
