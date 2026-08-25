import { describe, expect, it } from 'vitest';

import { parseLauncherSearch } from './search';

describe('parseLauncherSearch', () => {
  it('空参数 → 空对象', () => {
    expect(parseLauncherSearch({})).toEqual({});
  });

  it('解析 q 与 engine，并去掉首尾空白', () => {
    expect(parseLauncherSearch({ q: '  react hooks  ', engine: '  google ' })).toEqual({
      q: 'react hooks',
      engine: 'google',
    });
  });

  it('空白串视为未设置', () => {
    expect(parseLauncherSearch({ q: '   ', engine: '' })).toEqual({});
  });

  it('非字符串值忽略', () => {
    expect(parseLauncherSearch({ q: 2024, engine: null })).toEqual({});
  });
});
