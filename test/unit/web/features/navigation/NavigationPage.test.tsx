import type { ReactNode } from 'react';

import type { NavigationSearch } from '@nav/features/navigation/search';
// @vitest-environment jsdom
import type { Bookmark, Category } from '@shared/api/types';

import { Provider, createStore } from 'jotai';
import { act, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { NavigationPage } from '@nav/features/navigation/NavigationPage';

import { buttonWithText, click, fill, mount } from '../../render';

const { auth, route, navigate } = vi.hoisted(() => ({
  auth: { authed: false, logout: vi.fn() },
  route: {
    search: {} as NavigationSearch,
    key: 'initial',
    nextKey: 0,
    setSearch: (_value: NavigationSearch, _key?: string) => {},
  },
  navigate: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useSearch: () => route.search }),
  useLocation: () => ({ state: { __TSR_key: route.key }, href: '/', search: route.search }),
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => auth }));
vi.mock('@nav/features/layout/BrandIcon', () => ({ BrandIcon: () => null }));
vi.mock('@nav/hooks/useBackground', () => ({ useBackground: () => {} }));
vi.mock('@nav/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('@nav/api/client', () => ({
  api: {
    getBookmarks: vi.fn(),
    searchBookmarks: vi.fn(),
    getCategories: vi.fn(),
    getTags: vi.fn(),
    getPublicSettings: vi.fn(),
    updateBookmark: vi.fn(),
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
  const [store] = useState(createStore);
  const [location, setLocation] = useState({ search: initial, key: 'initial' });
  route.search = location.search;
  route.key = location.key;
  route.setSearch = (search, key) =>
    setLocation({ search, key: key ?? `entry-${++route.nextKey}` });
  return (
    <Provider store={store}>
      <NavigationPage />
    </Provider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  route.nextKey = 0;
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
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
    category(4, '前端', 2),
    category(5, 'React', 4),
    category(6, '博客', 3),
  ]);
  vi.mocked(api.getTags).mockResolvedValue([
    { id: 1, name: 'React', slug: 'react', bookmarkCount: 1 },
  ]);
  vi.mocked(api.getPublicSettings).mockResolvedValue({
    searchEngines: [],
    defaultEngineId: 'google',
    backgroundImageUrl: '',
    backgroundImageEnabled: false,
  });
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
  await click(
    buttonWithText(app.container.querySelector('#section-category-工具') as HTMLElement, '开发'),
  );
  expect(route.search.category).toBe('开发');
  expect(api.getBookmarks).toHaveBeenCalledWith(
    undefined,
    expect.objectContaining({ category: '开发', limit: 12 }),
    expect.any(AbortSignal),
  );
});

it('常用切换覆盖各分区条目，只刷新常用资源，不刷新分类和标签', async () => {
  auth.authed = true;
  let pinned = false;
  const bookmark = item(2);
  vi.mocked(api.getBookmarks).mockImplementation(async (_token, options) => ({
    items: options?.pinned
      ? pinned
        ? [{ ...bookmark, isPinned: true }]
        : []
      : options?.category === 'uncategorized'
        ? []
        : [bookmark],
    nextCursor: null,
  }));
  vi.mocked(api.updateBookmark).mockImplementationOnce(async () => {
    pinned = true;
    return { ...bookmark, isPinned: true };
  });
  app = await mount(<Host />);
  const requests = vi.mocked(api.getBookmarks).mock.calls.length;
  await click(app.container.querySelector('[aria-label="加入常用：网站2"]')!);
  expect(api.updateBookmark).toHaveBeenCalledWith('', 2, { isPinned: true });
  expect(api.getBookmarks).toHaveBeenCalledTimes(requests + 1);
  expect(vi.mocked(api.getBookmarks).mock.calls.at(-1)?.[1]).toMatchObject({ pinned: true });
  expect(api.getCategories).toHaveBeenCalledOnce();
  expect(api.getTags).toHaveBeenCalledOnce();
  expect(app.container.querySelectorAll('[aria-label="取消常用：网站2"]')).toHaveLength(3);
  expect(app.container.textContent).toContain('已加入常用');
});

it('设置首载失败提供原地重试，恢复时保留搜索输入与已加载书签', async () => {
  vi.mocked(api.getPublicSettings).mockRejectedValueOnce(new Error('网络中断'));
  app = await mount(<Host initial={{ mode: 'web' }} />);
  expect(app.container.querySelector('[role="alert"]')?.textContent).toContain(
    '设置加载失败：网络中断',
  );
  const input = app.container.querySelector('input')!;
  await fill(input, 'example.com');
  const section = app.container.querySelector('#section-category-工具');
  let resolve!: (value: Awaited<ReturnType<typeof api.getPublicSettings>>) => void;
  vi.mocked(api.getPublicSettings).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await click(buttonWithText(app.container, '重试设置'));
  expect(app.container.textContent).toContain('正在加载设置…');
  expect(api.getPublicSettings).toHaveBeenCalledTimes(2);
  await act(() =>
    resolve({
      searchEngines: [
        { id: 'custom', name: '自定搜索', url: 'https://example.com/?q={query}', builtin: false },
      ],
      defaultEngineId: 'custom',
      backgroundImageUrl: '',
      backgroundImageEnabled: false,
    }),
  );
  expect(app.container.querySelector('[role="alert"]')).toBeNull();
  expect(app.container.querySelector('#search-engine')?.textContent).toContain('自定搜索');
  expect(app.container.querySelector('input')).toBe(input);
  expect(input.value).toBe('example.com');
  expect(app.container.querySelector('#section-category-工具')).toBe(section);
  expect(section?.textContent).toContain('网站2');
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
  const tools = app.container.querySelector('#section-category-工具') as HTMLElement;
  await click(buttonWithText(tools, '开发'));
  await click(buttonWithText(tools, '工具'));
  const signals = vi.mocked(api.getBookmarks).mock.calls.map((call) => call[2]!);
  auth.authed = false;
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [item(9, '公开网站')], nextCursor: null });
  await act(() => route.setSearch({ mode: 'site' }));
  expect(app.container.textContent).not.toContain('私有网站');
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  await click(
    buttonWithText(app.container.querySelector('#section-category-工具') as HTMLElement, '开发'),
  );
  expect(app.container.textContent).not.toContain('私有网站');
  expect(app.container.textContent).toContain('公开网站');
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

it('逐层展示到四级并可返回祖先，顶部高亮所属一级，选择后焦点留在路径', async () => {
  app = await mount(<Host />);
  const tools = app.container.querySelector('#section-category-工具') as HTMLElement;
  expect(tools.querySelector('select')).toBeNull();
  expect(tools.querySelector('[aria-label="工具子分类"]')?.textContent).toBe('开发');
  for (const name of ['开发', '前端', 'React']) await click(buttonWithText(tools, name));
  expect(route.search.category).toBe('React');
  expect(tools.querySelector('[aria-label="工具分类路径"]')?.textContent).toBe('工具开发前端React');
  expect(tools.querySelector('ul[aria-label$="子分类"]')).toBeNull();
  expect(document.activeElement?.textContent).toBe('React');
  const topNav = app.container.querySelector('[aria-label="分类导航"]') as HTMLElement;
  expect(buttonWithText(topNav, '工具').getAttribute('aria-current')).toBe('location');
  await click(buttonWithText(tools, '开发'));
  expect(route.search.category).toBe('开发');
  expect(tools.querySelector('[aria-label="开发子分类"]')?.textContent).toBe('前端');
  expect(api.getBookmarks).toHaveBeenLastCalledWith(
    undefined,
    expect.objectContaining({ category: 'React' }),
    expect.any(AbortSignal),
  );
});

it('多个分区独立保留路径，一级导航只定位，搜索清除后保留内容缓存', async () => {
  app = await mount(<Host />);
  const tools = app.container.querySelector('#section-category-工具') as HTMLElement;
  const reading = app.container.querySelector('#section-category-阅读') as HTMLElement;
  for (const name of ['开发', '前端', 'React']) await click(buttonWithText(tools, name));
  await click(buttonWithText(reading, '博客'));
  expect(tools.querySelector('[aria-current="page"]')?.textContent).toBe('React');
  expect(reading.querySelector('[aria-current="page"]')?.textContent).toBe('博客');
  const count = vi.mocked(api.getBookmarks).mock.calls.length;
  await click(
    buttonWithText(app.container.querySelector('[aria-label="分类导航"]') as HTMLElement, '工具'),
  );
  expect(route.search.category).toBe('React');
  expect(api.getBookmarks).toHaveBeenCalledTimes(count);
  expect(vi.mocked(Element.prototype.scrollIntoView).mock.instances.at(-1)).toBe(tools);
  await fill(app.container.querySelector('input')!, 'React');
  await settle();
  await click(app.container.querySelector('[aria-label="清除搜索"]')!);
  expect(reading.querySelector('[aria-current="page"]')?.textContent).toBe('博客');
  expect(api.getBookmarks).toHaveBeenCalledTimes(count);
});

it('深层链接展开完整路径；重新挂载仅恢复URL分类，其他分区从一级开始', async () => {
  app = await mount(<Host initial={{ category: 'React' }} />);
  expect(
    app.container.querySelector('#section-category-工具 [aria-current="page"]')?.textContent,
  ).toBe('React');
  expect(
    (vi.mocked(Element.prototype.scrollIntoView).mock.instances.at(-1) as HTMLElement | undefined)
      ?.id,
  ).toBe('section-category-工具');
  await click(
    buttonWithText(app.container.querySelector('#section-category-阅读') as HTMLElement, '博客'),
  );
  await app.cleanup();
  app = await mount(<Host initial={{ category: 'React' }} />);
  expect(
    app.container.querySelector('#section-category-工具 [aria-current="page"]')?.textContent,
  ).toBe('React');
  expect(
    app.container.querySelector('#section-category-阅读 [aria-current="page"]')?.textContent,
  ).toBe('阅读');
});

it('后退前进恢复当时各分区的选择和滚动，不被分类锚点覆盖', async () => {
  app = await mount(<Host />);
  const tools = app.container.querySelector('#section-category-工具') as HTMLElement;
  const reading = app.container.querySelector('#section-category-阅读') as HTMLElement;
  await click(buttonWithText(tools, '开发'));
  const earlier = { search: route.search, key: route.key };
  Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
  window.dispatchEvent(new Event('scroll'));
  await click(buttonWithText(reading, '博客'));
  const later = { search: route.search, key: route.key };
  Object.defineProperty(window, 'scrollY', { value: 1250, configurable: true });
  window.dispatchEvent(new Event('scroll'));
  const count = vi.mocked(api.getBookmarks).mock.calls.length;
  const anchors = vi.mocked(Element.prototype.scrollIntoView).mock.calls.length;
  await act(() => route.setSearch(earlier.search, earlier.key));
  expect(reading.querySelector('[aria-current="page"]')?.textContent).toBe('阅读');
  expect(tools.querySelector('[aria-current="page"]')?.textContent).toBe('开发');
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: 'instant' });
  // 模拟浏览器已应用恢复后的滚动。
  Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
  await act(() => route.setSearch(later.search, later.key));
  expect(reading.querySelector('[aria-current="page"]')?.textContent).toBe('博客');
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 1250, behavior: 'instant' });
  expect(api.getBookmarks).toHaveBeenCalledTimes(count);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(anchors);
});
