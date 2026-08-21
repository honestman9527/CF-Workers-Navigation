/** 工作区 URL 路由状态：解析与序列化。纯函数，便于单元测试。 */

export type WorkspaceView = 'active' | 'archive' | 'trash';

/**
 * URL 中的工作区筛选状态（最小形式：省略字段表示默认值，从而保持 URL 精简）。
 * `view` 省略 = active；`pinned` 省略 = true（仅对 active 有意义）。
 */
export type WorkspaceSearch = {
  view?: WorkspaceView;
  pinned?: boolean;
  category?: string;
  tag?: string;
  q?: string;
};

/** 供页面逻辑消费的完整形态（已套用默认值）。 */
export type ResolvedWorkspaceSearch = {
  view: WorkspaceView;
  pinned: boolean;
  category?: string;
  tag?: string;
  q?: string;
};

function isView(value: unknown): value is WorkspaceView {
  return value === 'active' || value === 'archive' || value === 'trash';
}

function rawString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  // qss decode 会把纯数字/布尔字符串转成 number/boolean，这里还原为字符串。
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/**
 * 把 URL search 对象（qss decode 后的原始值，含 number/boolean）解析为最小 WorkspaceSearch。
 * 非法值一律忽略（视为默认），绝不抛错。
 */
export function parseWorkspaceSearch(search: Record<string, unknown>): WorkspaceSearch {
  const view = isView(search.view) ? search.view : undefined;
  const result: WorkspaceSearch = { view };

  if (view === undefined || view === 'active') {
    const pinned = search.pinned;
    if (pinned === '0' || pinned === 0 || pinned === false) {
      result.pinned = false;
    } else if (pinned === '1' || pinned === 1 || pinned === true) {
      result.pinned = true;
    }
  }

  const category = rawString(search.category);
  if (category) result.category = category;
  const tag = rawString(search.tag);
  if (tag) result.tag = tag;
  const q = rawString(search.q);
  if (q) result.q = q;

  return result;
}

/** 套用默认值，供工作区页面直接消费。 */
export function resolveWorkspaceSearch(search: WorkspaceSearch): ResolvedWorkspaceSearch {
  const view = search.view ?? 'active';
  return {
    view,
    pinned: view === 'active' ? (search.pinned ?? true) : false,
    category: search.category,
    tag: search.tag,
    q: search.q,
  };
}
