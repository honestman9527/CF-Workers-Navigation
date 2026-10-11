// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';

import {
  legacyNavigationSearch,
  parseNavigationSearch,
  readSearchMode,
  saveSearchMode,
} from '@nav/features/navigation/search';

beforeEach(() => localStorage.clear());

it('模式从站内开始，记住选择；URL 解析只接受有效模式', () => {
  expect(readSearchMode()).toBe('site');
  saveSearchMode('web');
  expect(readSearchMode()).toBe('web');
  expect(
    parseNavigationSearch({ mode: 'site', q: ' 中文 ', tag: 'tools', untagged: true }),
  ).toEqual({ mode: 'site', q: '中文', tag: 'tools' });
  expect(parseNavigationSearch({ mode: 'invalid', q: 123, untagged: '1' })).toEqual({
    q: '123',
    untagged: true,
  });
});

it('旧链接保留搜索、引擎及分类筛选，去掉旧分页与未知参数', () => {
  expect(legacyNavigationSearch({ q: '导航', engine: 'bing', page: 4 }, 'web')).toEqual({
    mode: 'web',
    q: '导航',
    engine: 'bing',
  });
  expect(
    legacyNavigationSearch({ category: '工具', tag: '开发', q: 'React', pageSize: 96 }, 'site'),
  ).toEqual({ mode: 'site', category: '工具', tag: '开发', q: 'React' });
});
