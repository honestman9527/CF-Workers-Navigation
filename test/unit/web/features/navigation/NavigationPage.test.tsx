import type { ReactNode } from 'react';

import type { NavigationSearch } from '@nav/features/navigation/search';
// @vitest-environment jsdom
import type { Bookmark, Category } from '@shared/api/types';

import { act, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { NavigationPage } from '@nav/features/navigation/NavigationPage';

import { buttonWithText, click, fill, mount } from '../../render';

const { auth, route, navigate } = vi.hoisted(() => ({
  auth: { authed: false, logout: vi.fn() },
  route: { search: {} as NavigationSearch, setSearch: (_value: NavigationSearch) => {} },
  navigate: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useSearch: () => route.search }),
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => auth }));
vi.mock('@nav/features/layout/BrandIcon', () => ({ BrandIcon: () => null }));
vi.mock('@nav/hooks/useSettings', () => ({ useSettings: () => null }));
vi.mock('@nav/hooks/useBackground', () => ({ useBackground: () => {} }));
vi.mock('@nav/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('@nav/api/client', () => ({
  api: {
    getBookmarks: vi.fn(),
    searchBookmarks: vi.fn(),
    getCategories: vi.fn(),
    getTags: vi.fn(),
  },
  ApiError: class extends Error {},
}));

let app: Awaited<ReturnType<typeof mount>>;
const item = (id: number, title = `网站${id}`) =>
  ({
    id,
    title,
    url: `https://site${id}.com`,
    description: '一个实用网站',
    iconUrl: null,
    isPinned: false,
  }) as Bookmark;
const category = (id: number, slug: string, parentId: number | null = null) =>
  ({ id, slug, name: slug, parentId, sortOrder: id, bookmarkCount: 1 }) as Category;

function Host({ initial = {} }: { initial?: NavigationSearch }) {
  const [search, setSearch] = useState(initial);
  route.search = search;
  route.setSearch = setSearch;
  return <NavigationPage />;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  auth.authed = false;
  vi.stubGlobal('IntersectionObserver', undefined);
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
  vi.spyOn(window, 'open').mockImplementation(() => null);
  navigate.mockImplementation(
    ({
      search,
    }: {
      search?: NavigationSearch | ((prev: NavigationSearch) => NavigationSearch);
    }) => {
      if (search) route.setSearch(typeof search === 'function' ? search(route.search) : search);
      return Promise.resolve();
    },
  );
  vi.mocked(api.getCategories).mockResolvedValue([
    category(1, '工具'),
    category(2, '开发', 1),
    category(3, '阅读'),
  ]);
  vi.mocked(api.getTags).mockResolvedValue([
    { id: 1, name: 'React', slug: 'react', bookmarkCount: 1 },
  ]);
  vi.mocked(api.getBookmarks).mockImplementation(async (_token, options) => ({
    items:
      options?.category === 'uncategorized'
        ? []
        : [item(options?.pinned ? 1 : options?.category === '阅读' ? 3 : 2)],
    nextCursor: null,
  }));
  vi.mocked(api.searchBookmarks).mockResolvedValue({ items: [item(4)], nextCursor: null });
});
afterEach(async () => {
  await app?.cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function settle() {
  await act(() => vi.advanceTimersByTimeAsync(251));
}
async function submit() {
  await act(() =>
    app.container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

it('同时展示常用及多个一级分类；子分类切换在原分区取数', async () => {
  app = await mount(<Host />);
  expect(app.container.querySelector('#section-category-工具')?.textContent).toContain('网站2');
  expect(app.container.querySelector('#section-category-阅读')?.textContent).toContain('网站3');
  const select = app.container.querySelector<HTMLSelectElement>('[aria-label="工具子分类"]')!;
  await act(() => {
    select.value = '开发';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(route.search.category).toBe('开发');
  expect(api.getBookmarks).toHaveBeenCalledWith(
    undefined,
    expect.objectContaining({ category: '开发', limit: 12 }),
    expect.any(AbortSignal),
  );
});

it('站内查询网址不打开网页；网页模式保留输入且不请求站内搜索', async () => {
  app = await mount(<Host />);
  await fill(app.container.querySelector('input')!, 'example.com');
  await settle();
  await submit();
  expect(window.open).not.toHaveBeenCalled();
  const count = vi.mocked(api.searchBookmarks).mock.calls.length;
  await click(buttonWithText(app.container, '网页'));
  await settle();
  expect(app.container.querySelector('input')!.value).toBe('example.com');
  await submit();
  expect(window.open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  expect(api.searchBookmarks).toHaveBeenCalledTimes(count);
  expect(localStorage.getItem('nav-search-mode')).toBe('web');
});

it('搜索与清空保留分类节点和已加载内容，不重复请求常用', async () => {
  app = await mount(<Host />);
  const section = app.container.querySelector('#section-category-工具');
  const count = vi.mocked(api.getBookmarks).mock.calls.length;
  await fill(app.container.querySelector('input')!, 'React');
  await settle();
  expect(app.container.querySelector('[aria-label="站内搜索结果"]')).not.toBeNull();
  await click(app.container.querySelector('[aria-label="清除搜索"]')!);
  await settle();
  expect(app.container.querySelector('#section-category-工具')).toBe(section);
  expect(api.getBookmarks).toHaveBeenCalledTimes(count);
});

it('显式站内模式优先于浏览器记忆，标签与关键词组合查询', async () => {
  localStorage.setItem('nav-search-mode', 'web');
  app = await mount(<Host initial={{ mode: 'site', q: 'React', tag: 'react' }} />);
  expect(api.searchBookmarks).toHaveBeenCalledWith(
    undefined,
    'React',
    expect.objectContaining({ tag: 'react' }),
    expect.any(AbortSignal),
  );
  expect(buttonWithText(app.container, '站内').getAttribute('aria-pressed')).toBe('true');
});

it('网页 bang 正常打开引擎，只有前缀时禁用提交；输入法确认不触发搜索', async () => {
  app = await mount(<Host initial={{ mode: 'web' }} />);
  await fill(app.container.querySelector('input')!, '!g React');
  await settle();
  await submit();
  expect(window.open).toHaveBeenLastCalledWith(
    'https://www.google.com/search?q=React',
    '_blank',
    'noopener,noreferrer',
  );
  await fill(app.container.querySelector('input')!, '!g');
  await settle();
  expect(app.container.querySelector<HTMLButtonElement>('[aria-label="搜索网页"]')!.disabled).toBe(
    true,
  );
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    isComposing: true,
    bubbles: true,
    cancelable: true,
  });
  await act(() => app.container.querySelector('input')!.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(api.searchBookmarks).not.toHaveBeenCalled();
});

it('退出身份后立即卸载私有数据和旧索引', async () => {
  auth.authed = true;
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [item(8, '私有网站')], nextCursor: null });
  app = await mount(<Host />);
  expect(app.container.textContent).toContain('私有网站');
  const signals = vi.mocked(api.getBookmarks).mock.calls.map((call) => call[2]!);
  auth.authed = false;
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [item(9, '公开网站')], nextCursor: null });
  await act(() => route.setSearch({ mode: 'site' }));
  expect(app.container.textContent).not.toContain('私有网站');
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

it('分类靠近视区才加载，各分区错误与重试独立', async () => {
  const observers: Array<{ target?: Element; enter: () => void }> = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      entry: { target?: Element; enter: () => void };
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        this.entry = { enter: () => callback([{ isIntersecting: true }]) };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {}
    },
  );
  app = await mount(<Host />);
  expect(api.getBookmarks).toHaveBeenCalledTimes(1);
  vi.mocked(api.getBookmarks).mockRejectedValueOnce(new Error('工具加载失败'));
  await act(async () =>
    observers.find((entry) => entry.target?.id === 'section-category-工具')!.enter(),
  );
  const tools = app.container.querySelector('#section-category-工具')!;
  expect(tools.textContent).toContain('工具加载失败');
  await act(async () =>
    observers.find((entry) => entry.target?.id === 'section-category-阅读')!.enter(),
  );
  expect(app.container.querySelector('#section-category-阅读')!.textContent).toContain('网站3');
  await click(buttonWithText(tools as HTMLElement, '重试'));
  expect(tools.textContent).toContain('网站2');
  expect(tools.textContent).not.toContain('工具加载失败');
});

it('清除搜索恢复原浏览位置，不重新定位已选择分类', async () => {
  Object.defineProperty(window, 'scrollY', { value: 680, configurable: true });
  app = await mount(<Host initial={{ mode: 'site', category: '工具' }} />);
  const scrollCount = vi.mocked(Element.prototype.scrollIntoView).mock.calls.length;
  await fill(app.container.querySelector('input')!, 'React');
  await settle();
  await click(app.container.querySelector('[aria-label="清除搜索"]')!);
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 680, behavior: 'instant' });
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(scrollCount);
});

it('返回无显式模式的首页继续沿用最后选择；输入法组合期间不发起查询', async () => {
  app = await mount(<Host />);
  await click(buttonWithText(app.container, '网页'));
  await act(() => route.setSearch({}));
  expect(buttonWithText(app.container, '网页').getAttribute('aria-pressed')).toBe('true');
  await click(buttonWithText(app.container, '站内'));
  const input = app.container.querySelector('input')!;
  await act(() => input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await fill(input, '开发');
  await settle();
  expect(api.searchBookmarks).not.toHaveBeenCalled();
  await act(() => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await settle();
  expect(api.searchBookmarks).toHaveBeenCalledWith(
    undefined,
    '开发',
    expect.any(Object),
    expect.any(AbortSignal),
  );
});
