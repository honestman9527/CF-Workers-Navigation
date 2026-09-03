import { describe, expect, it } from 'vitest';

import { getAuthReturnPath, parseLoginSearch, resolveAuthRedirect } from './redirect';

describe('认证返回地址', () => {
  it('保留管理后台子路径', () => {
    expect(getAuthReturnPath({ pathname: '/admin/settings', searchStr: '', hash: '' })).toBe(
      '/admin/settings',
    );
  });

  it('保留工作区的查询参数与 hash', () => {
    expect(
      getAuthReturnPath({
        pathname: '/workspace',
        searchStr: '?category=dev&q=tanstack',
        hash: 'bookmark-42',
      }),
    ).toBe('/workspace?category=dev&q=tanstack#bookmark-42');
  });

  it('缺失 redirect 时使用默认去向', () => {
    expect(parseLoginSearch({})).toEqual({});
    expect(resolveAuthRedirect(undefined)).toBeUndefined();
  });

  it('只接受单个站内路径', () => {
    expect(resolveAuthRedirect('/admin/data')).toBe('/admin/data');
    expect(parseLoginSearch({ redirect: '/workspace?tag=react' })).toEqual({
      redirect: '/workspace?tag=react',
    });
    expect(resolveAuthRedirect(['/', '/admin'])).toBeUndefined();
  });

  it('拒绝外部与协议相对地址', () => {
    expect(resolveAuthRedirect('https://example.com')).toBeUndefined();
    expect(resolveAuthRedirect('//example.com')).toBeUndefined();
  });
});
