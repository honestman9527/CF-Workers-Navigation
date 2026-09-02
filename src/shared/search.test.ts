import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SEARCH_ENGINES,
  buildSearchUrl,
  domainOf,
  faviconFor,
  looksLikeUrl,
  normalizeNavigateUrl,
  parseBangQuery,
  resolveBookmarkIcon,
} from './search';

describe('buildSearchUrl', () => {
  it('用 encodeURIComponent 替换 {query} 占位符', () => {
    const engine = {
      id: 'g',
      name: 'Google',
      url: 'https://www.google.com/search?q={query}',
      builtin: true,
    };
    expect(buildSearchUrl(engine, 'hello world')).toBe(
      'https://www.google.com/search?q=hello%20world',
    );
    expect(buildSearchUrl(engine, '书签&amp;')).toBe(
      'https://www.google.com/search?q=%E4%B9%A6%E7%AD%BE%26amp%3B',
    );
  });
});

describe('domainOf / faviconFor', () => {
  it('提取域名并生成 favicon 代理 URL', () => {
    expect(domainOf('https://www.example.com/path?q=1')).toBe('example.com');
    expect(faviconFor('example.com')).toBe(
      'https://www.google.com/s2/favicons?domain=example.com&sz=64',
    );
    expect(resolveBookmarkIcon(null, 'https://example.com')).toBe(
      'https://www.google.com/s2/favicons?domain=example.com&sz=64',
    );
    expect(resolveBookmarkIcon('https://cdn.example.com/i.png', 'https://example.com')).toBe(
      'https://cdn.example.com/i.png',
    );
  });

  it('保留非法 URL 原文，并统一去除 www 前缀', () => {
    expect(domainOf('https://WWW.Example.com')).toBe('example.com');
    expect(domainOf('not a url')).toBe('not a url');
  });
});

describe('looksLikeUrl', () => {
  it('识别 http(s)、域名、localhost 与 IPv4', () => {
    expect(looksLikeUrl('https://example.com')).toBe(true);
    expect(looksLikeUrl('example.com/path')).toBe(true);
    expect(looksLikeUrl('localhost:8787')).toBe(true);
    expect(looksLikeUrl('127.0.0.1:8080/x')).toBe(true);
    expect(looksLikeUrl('hello world')).toBe(false);
    expect(looksLikeUrl('你好')).toBe(false);
    expect(looksLikeUrl('not a domain.')).toBe(false);
  });
});

describe('normalizeNavigateUrl', () => {
  it('补全 https 协议，保留已有协议', () => {
    expect(normalizeNavigateUrl('example.com')).toBe('https://example.com');
    expect(normalizeNavigateUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeNavigateUrl('chrome://settings')).toBe('chrome://settings');
  });
});

describe('parseBangQuery', () => {
  it('按别名 / id / 名称解析 bang', () => {
    const engines = [
      ...DEFAULT_SEARCH_ENGINES,
      { id: 'custom-x', name: 'MySearch', url: 'https://example.com/s?q={query}', builtin: false },
    ];
    expect(parseBangQuery('!g hello', engines)).toEqual({
      query: 'hello',
      engineId: 'google',
      bang: 'g',
    });
    expect(parseBangQuery('!github react', engines)).toEqual({
      query: 'react',
      engineId: 'github',
      bang: 'github',
    });
    // 按引擎 id 匹配
    expect(parseBangQuery('!custom-x kw', engines)).toEqual({
      query: 'kw',
      engineId: 'custom-x',
      bang: 'custom-x',
    });
    // 按引擎名称匹配（id 与名称不同时）
    expect(parseBangQuery('!MySearch kw2', engines)).toEqual({
      query: 'kw2',
      engineId: 'custom-x',
      bang: 'mysearch',
    });
  });

  it('未知 bang 视为普通查询', () => {
    const engines = DEFAULT_SEARCH_ENGINES;
    expect(parseBangQuery('!unknown query', engines)).toEqual({ query: '!unknown query' });
  });

  it('无 bang 时代原样返回', () => {
    expect(parseBangQuery('  hello  ', DEFAULT_SEARCH_ENGINES)).toEqual({ query: 'hello' });
  });
});
