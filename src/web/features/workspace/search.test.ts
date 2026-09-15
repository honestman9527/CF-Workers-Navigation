import { describe, expect, it } from 'vitest';

import {
  isCanonicalWorkspaceSearch,
  parseWorkspaceSearch,
  selectWorkspaceFilter,
  setWorkspaceQuery,
} from './search';

describe('工作区导航', () => {
  it('裸入口和旧 view 参数均进入全部活动网站', () => {
    expect(parseWorkspaceSearch({})).toEqual({});
    expect(parseWorkspaceSearch({ view: 'trash' })).toEqual({});
  });

  it('旧组合筛选按分类、标签、无标签、置顶排序，仅保留一个条件', () => {
    expect(
      parseWorkspaceSearch({
        category: 'dev',
        tag: 'react',
        untagged: true,
        pinned: true,
        q: 'demo',
      }),
    ).toEqual({ category: 'dev', q: 'demo' });
    expect(parseWorkspaceSearch({ tag: 'react', untagged: true, pinned: true })).toEqual({
      tag: 'react',
    });
    expect(parseWorkspaceSearch({ untagged: true, pinned: true })).toEqual({ untagged: true });
    expect(parseWorkspaceSearch({ pinned: true })).toEqual({ pinned: true });
  });

  it.each([true, 1, '1', 'true'])('接受布尔真值 %s', (value) => {
    expect(parseWorkspaceSearch({ untagged: value })).toEqual({ untagged: true });
    expect(parseWorkspaceSearch({ pinned: value })).toEqual({ pinned: true });
  });

  it.each([false, 0, '0', 'false', 'invalid', null, {}])('忽略非真值 %s', (value) => {
    expect(parseWorkspaceSearch({ untagged: value, pinned: value })).toEqual({});
  });

  it('规范字符串，保留数字和布尔查询词', () => {
    expect(parseWorkspaceSearch({ category: ' dev ', tag: '', q: ' demo ' })).toEqual({
      category: 'dev',
      q: 'demo',
    });
    expect(parseWorkspaceSearch({ q: 2024 })).toEqual({ q: '2024' });
    expect(parseWorkspaceSearch({ q: false })).toEqual({ q: 'false' });
    expect(parseWorkspaceSearch({ category: [], tag: {}, q: '' })).toEqual({});
  });

  it('导航替换旧条件，重复选择保持选中，全部网站清除筛选', () => {
    let search = setWorkspaceQuery(selectWorkspaceFilter({ category: 'dev' }), 'demo');
    search = selectWorkspaceFilter({ tag: 'react' });
    expect(search).toEqual({ tag: 'react' });
    expect(selectWorkspaceFilter(search)).toEqual(search);
    expect(selectWorkspaceFilter({ category: 'uncategorized' })).toEqual({
      category: 'uncategorized',
    });
    expect(selectWorkspaceFilter({ untagged: true })).toEqual({ untagged: true });
    expect(selectWorkspaceFilter({})).toEqual({});
  });

  it.each([{ category: 'dev' }, { tag: 'react' }, { untagged: true }, { pinned: true }, {}])(
    '搜索与清除保留导航位置 %s',
    (filter) => {
      const search = setWorkspaceQuery(filter, ' demo ');
      expect(search).toEqual({ ...filter, q: 'demo' });
      expect(setWorkspaceQuery(search, '')).toEqual(filter);
    },
  );

  it('规范化旧地址但不会因数字或布尔查询词产生循环', () => {
    for (const raw of [{ q: 2024 }, { q: false }, { pinned: true }, { tag: 'untagged' }, {}]) {
      expect(isCanonicalWorkspaceSearch(raw, parseWorkspaceSearch(raw))).toBe(true);
    }
    for (const raw of [
      { category: 'dev', tag: 'react' },
      { untagged: 1 },
      { view: 'trash' },
      { q: ['demo'] },
    ]) {
      expect(isCanonicalWorkspaceSearch(raw, parseWorkspaceSearch(raw))).toBe(false);
    }
    expect(selectWorkspaceFilter(setWorkspaceQuery({ tag: 'react' }, 'demo'))).toEqual({
      tag: 'react',
    });
  });

  it('真实 untagged 标签不会被误判为无标签入口', () => {
    expect(parseWorkspaceSearch({ tag: 'untagged' })).toEqual({ tag: 'untagged' });
  });
});
