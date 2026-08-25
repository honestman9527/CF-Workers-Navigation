import { describe, expect, it } from 'vitest';

import { parseWorkspaceSearch, resolveWorkspaceSearch } from './search';

describe('parseWorkspaceSearch', () => {
  it('空参数 → 空对象，resolve 后为默认全部网站（无 pinned）', () => {
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

  it('只有显式 pinned=true 才解析为常用入口，其余均为全部网站', () => {
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
