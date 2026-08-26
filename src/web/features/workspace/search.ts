import type { Category } from '@shared/api/types';

import { UNCATEGORIZED_SLUG } from '@shared/api/types';

import { buildCategoryTree } from '../categories/tree';

/** 工作区 URL 路由状态：解析与序列化。纯函数，便于单元测试。 */

/**
 * URL 中的工作区筛选状态（最小形式：省略字段表示默认值，从而保持 URL 精简）。
 * `pinned` 省略（或 false）= 非「常用入口」，只有「常用入口」显式写 `pinned=true`。
 * 归档/回收站仅存在于管理后台，不再作为工作区视图；旧 `view` 参数会被忽略。
 */
export type WorkspaceSearch = {
  pinned?: boolean;
  category?: string;
  tag?: string;
  q?: string;
};

/** 供页面逻辑消费的完整形态（已套用默认值）。 */
export type ResolvedWorkspaceSearch = {
  pinned: boolean;
  category?: string;
  tag?: string;
  q?: string;
};

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
 * 非法值一律忽略（视为默认），绝不抛错；旧 `view` 参数忽略（工作区只展示活动书签）。
 */
export function parseWorkspaceSearch(search: Record<string, unknown>): WorkspaceSearch {
  const result: WorkspaceSearch = {};

  const pinned = search.pinned;
  if (pinned === '1' || pinned === 1 || pinned === true) {
    result.pinned = true;
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
  return {
    // 只有「常用入口」显式 pinned=true；省略或 false 一律视为非常用入口。
    pinned: search.pinned === true,
    category: search.category,
    tag: search.tag,
    q: search.q,
  };
}

/**
 * 裸入口：URL 没有任何筛选形态（也非「常用入口」/搜索），是需要注入默认分类的状态。
 * 取代旧的「全部网站」落地语义——书签柜不再有「展示全部」的落地视图。
 */
export function isDefaultLanding(resolved: ResolvedWorkspaceSearch): boolean {
  return !resolved.pinned && !resolved.category && !resolved.tag && !resolved.q;
}

/**
 * 解析默认分类：记忆的分类仍存在则用之（未分类是常驻合法值），否则取按树序的第一个根分类；
 * 完全没有分类时降级到「未分类」。返回的 slug 一定可作为 `category` 筛选参数。
 */
export function resolveDefaultCategorySlug(categories: Category[], remembered?: string): string {
  if (remembered === UNCATEGORIZED_SLUG) return remembered;
  if (remembered && categories.some((item) => item.slug === remembered)) return remembered;
  const firstRoot = buildCategoryTree(categories)[0];
  if (firstRoot) return firstRoot.slug;
  return UNCATEGORIZED_SLUG;
}
