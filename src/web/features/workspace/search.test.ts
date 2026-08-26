import { describe, expect, it } from 'vitest';

import {
  isDefaultLanding,
  parseWorkspaceSearch,
  resolveDefaultCategorySlug,
  resolveWorkspaceSearch,
} from './search';

describe('parseWorkspaceSearch', () => {
  it('空参数 → 空对象，resolve 后为裸入口（等待默认分类注入）', () => {
    expect(parseWorkspaceSearch({})).toEqual({});
    expect(resolveWorkspaceSearch(parseWorkspaceSearch({}))).toEqual({ pinned: false });
  });

  it('解析 pinned（仅 true 形式）、category、tag、q', () => {
    expect(parseWorkspaceSearch({ pinned: '1', category: 'dev', tag: 'react', q: 'demo' })).toEqual(
      {
        pinned: true,
        category: 'dev',
        tag: 'react',
        q: 'demo',
      },
    );
  });

  it('pinned 的 false/0 形式与省略等价（不进入 URL 语义）', () => {
    expect(parseWorkspaceSearch({ pinned: '0' }).pinned).toBeUndefined();
    expect(parseWorkspaceSearch({ pinned: false }).pinned).toBeUndefined();
    expect(parseWorkspaceSearch({ pinned: 0 }).pinned).toBeUndefined();
    expect(parseWorkspaceSearch({ pinned: true }).pinned).toBe(true);
    expect(parseWorkspaceSearch({ pinned: 1 }).pinned).toBe(true);
  });

  it('只有显式 pinned=true 才解析为常用入口', () => {
    expect(resolveWorkspaceSearch(parseWorkspaceSearch({ pinned: '1' })).pinned).toBe(true);
    expect(resolveWorkspaceSearch(parseWorkspaceSearch({ pinned: '0' })).pinned).toBe(false);
    expect(resolveWorkspaceSearch(parseWorkspaceSearch({})).pinned).toBe(false);
  });

  it('旧 view 参数（archive/trash）忽略，工作区只展示活动书签', () => {
    expect(parseWorkspaceSearch({ view: 'archive' })).toEqual({});
    expect(parseWorkspaceSearch({ view: 'trash', pinned: '1' })).toEqual({ pinned: true });
  });

  it('字符串参数去空白，空串视为未设置', () => {
    expect(parseWorkspaceSearch({ category: '  dev  ', q: '', tag: '' })).toEqual({
      category: 'dev',
    });
  });

  it('纯数字/布尔查询词还原为字符串（qss decode 会转 number/boolean）', () => {
    expect(parseWorkspaceSearch({ q: 2024 }).q).toBe('2024');
    expect(parseWorkspaceSearch({ q: false }).q).toBe('false');
  });
});

describe('isDefaultLanding', () => {
  it('无任何筛选（非常用入口、非搜索）为真', () => {
    expect(isDefaultLanding({ pinned: false })).toBe(true);
  });

  it('任一筛选形态即视为已有位置，不再注入默认分类', () => {
    expect(isDefaultLanding({ pinned: true })).toBe(false);
    expect(isDefaultLanding({ pinned: false, category: 'dev' })).toBe(false);
    expect(isDefaultLanding({ pinned: false, tag: 'react' })).toBe(false);
    expect(isDefaultLanding({ pinned: false, q: 'demo' })).toBe(false);
  });
});

describe('resolveDefaultCategorySlug', () => {
  const categories = [
    {
      id: 1,
      parentId: null,
      name: '开发',
      slug: 'dev',
      icon: null,
      sortOrder: 0,
      bookmarkCount: 0,
    },
    {
      id: 2,
      parentId: null,
      name: '阅读',
      slug: 'read',
      icon: null,
      sortOrder: 1,
      bookmarkCount: 0,
    },
    {
      id: 3,
      parentId: 1,
      name: '前端',
      slug: 'frontend',
      icon: null,
      sortOrder: 0,
      bookmarkCount: 0,
    },
  ];

  it('无记忆时取按树序的第一个根分类', () => {
    expect(resolveDefaultCategorySlug(categories)).toBe('dev');
  });

  it('记忆的分类仍存在时优先使用', () => {
    expect(resolveDefaultCategorySlug(categories, 'read')).toBe('read');
    expect(resolveDefaultCategorySlug(categories, 'frontend')).toBe('frontend');
  });

  it('记忆失效（已删除）时回退第一个根分类', () => {
    expect(resolveDefaultCategorySlug(categories, 'gone')).toBe('dev');
  });

  it('记忆「未分类」常驻生效（不是真实分类也能直接返回）', () => {
    expect(resolveDefaultCategorySlug(categories, 'uncategorized')).toBe('uncategorized');
  });

  it('返回的 slug 一定是可用的筛选参数（不存在空结果风险）', () => {
    expect(
      isDefaultLanding({ pinned: false, category: resolveDefaultCategorySlug(categories) }),
    ).toBe(false);
    expect(resolveDefaultCategorySlug(categories)).toBe(
      categories.find((item) => item.parentId === null)!.slug,
    );
  });

  it('完全没有任何分类时降级到「未分类」', () => {
    expect(resolveDefaultCategorySlug([])).toBe('uncategorized');
    expect(resolveDefaultCategorySlug([], 'dev')).toBe('uncategorized');
  });

  it('排序按 sortOrder 与名称，而非扁平数组顺序', () => {
    const shuffled = [categories[1], categories[0], categories[2]];
    expect(resolveDefaultCategorySlug(shuffled)).toBe('dev');
  });
});
