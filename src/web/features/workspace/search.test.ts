import { describe, expect, it } from 'vitest';

import { parseWorkspaceSearch, resolveWorkspaceSearch } from './search';

describe('parseWorkspaceSearch', () => {
  it('空参数 → 空对象，resolve 后为默认常用入口', () => {
    expect(parseWorkspaceSearch({})).toEqual({});
    expect(resolveWorkspaceSearch(parseWorkspaceSearch({}))).toEqual({
      view: 'active',
      pinned: true,
    });
  });

  it('识别合法 view，忽略非法 view', () => {
    expect(parseWorkspaceSearch({ view: 'trash' })).toEqual({ view: 'trash' });
    expect(parseWorkspaceSearch({ view: 'bogus' })).toEqual({});
  });

  it('pinned 支持字符串、布尔与数字形式', () => {
    expect(parseWorkspaceSearch({ pinned: '0' }).pinned).toBe(false);
    expect(parseWorkspaceSearch({ pinned: '1' }).pinned).toBe(true);
    expect(parseWorkspaceSearch({ pinned: false }).pinned).toBe(false);
    expect(parseWorkspaceSearch({ pinned: 0 }).pinned).toBe(false);
    expect(parseWorkspaceSearch({ pinned: 1 }).pinned).toBe(true);
  });

  it('archive/trash 视图忽略 pinned（无意义）', () => {
    expect(parseWorkspaceSearch({ view: 'archive', pinned: '0' })).toEqual({ view: 'archive' });
    expect(resolveWorkspaceSearch({ view: 'trash' }).pinned).toBe(false);
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

  it('合法过滤器全部保留', () => {
    expect(
      parseWorkspaceSearch({
        view: 'active',
        pinned: false,
        category: 'dev',
        tag: 'react',
        q: 'demo',
      }),
    ).toEqual({ view: 'active', pinned: false, category: 'dev', tag: 'react', q: 'demo' });
  });
});
