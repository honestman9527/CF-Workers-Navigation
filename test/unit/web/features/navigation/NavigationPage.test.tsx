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
    category(4, '前端', 1),
    category(5, 'React', 1),
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
  vi.mocked(api.getBookmarks).mockImplementation(async (options) => ({
    items:
      options?.category === 'uncategorized'
        ? []
        : [
            item(
              options?.pinned
                ? 1
                : ({ 工具: 2, 阅读: 3, 开发: 12, 前端: 14, React: 15, 博客: 16 }[
                    options?.category ?? ''
                  ] ?? 2),
            ),
          ],
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

it('默认只展示常用，一级下所有二级同时平铺，其他一级不取数', async () => {
  app = await mount(<Host />);
  expect(api.getBookmarks).toHaveBeenCalledTimes(1);
  expect(app.container.querySelector('#section-common')?.textContent).toContain('网站1');
  const nav = app.container.querySelector('[aria-label="分类导航"]') as HTMLElement;
  await click(buttonWithText(nav, '工具'));
  const tools = app.container.querySelector('#section-category-工具') as HTMLElement;
  expect([...tools.querySelectorAll('h3')].map((node) => node.textContent)).toEqual([
    '直属书签',
    '开发',
    '前端',
    'React',
  ]);
  expect(tools.textContent).toContain('网站12');
  expect(tools.textContent).toContain('网站14');
  expect(tools.textContent).toContain('网站15');
  expect(tools.querySelector('button')).toBeNull();
  expect(app.container.querySelector('#section-common')).toBeNull();
  expect(app.container.querySelector('#section-category-阅读')).toBeNull();
  expect(
    vi
      .mocked(api.getBookmarks)
      .mock.calls.slice(1)
      .map(([options]) => [options?.category, options?.categoryOnly]),
  ).toEqual([
    ['工具', true],
    ['开发', true],
    ['前端', true],
    ['React', true],
  ]);
});

it('常用切换更新当前条目，分类不重新请求，进入常用读取最新列表', async () => {
  auth.authed = true;
  const bookmark = item(2);
  vi.mocked(api.updateBookmark).mockResolvedValue({ ...bookmark, isPinned: true });
  app = await mount(<Host initial={{ category: '工具' }} />);
  const requests = vi.mocked(api.getBookmarks).mock.calls.length;
  await click(app.container.querySelector('[aria-label="加入常用：网站2"]')!);
  expect(api.getBookmarks).toHaveBeenCalledTimes(requests);
  expect(api.getCategories).toHaveBeenCalledOnce();
  expect(api.getTags).toHaveBeenCalledOnce();
  expect(app.container.querySelector('[aria-label="取消常用：网站2"]')).not.toBeNull();
  await click(
    buttonWithText(app.container.querySelector('[aria-label="分类导航"]') as HTMLElement, '常用'),
  );
  expect(api.getBookmarks).toHaveBeenLastCalledWith(
    expect.objectContaining({ pinned: true, category: undefined }),
    expect.any(AbortSignal),
  );
});

it('设置首载失败提供原地重试，恢复时保留搜索输入与已加载书签', async () => {
  vi.mocked(api.getPublicSettings).mockRejectedValueOnce(new Error('网络中断'));
  app = await mount(<Host initial={{ mode: 'web' }} />);
  expect(app.container.querySelector('[role="alert"]')?.textContent).toContain(
    '设置加载失败：网络中断',
  );
  const input = app.container.querySelector('input')!;
  await fill(input, 'example.com');
  const section = app.container.querySelector('#section-common');
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
  expect(app.container.querySelector('#section-common')).toBe(section);
  expect(section?.textContent).toContain('网站1');
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
  const section = app.container.querySelector('#section-common');
  const count = vi.mocked(api.getBookmarks).mock.calls.length;
  await fill(app.container.querySelector('input')!, 'React');
  await settle();
  expect(app.container.querySelector('[aria-label="站内搜索结果"]')).not.toBeNull();
  await click(app.container.querySelector('[aria-label="清除搜索"]')!);
  await settle();
  expect(app.container.querySelector('#section-common')).toBe(section);
  expect(api.getBookmarks).toHaveBeenCalledTimes(count);
});

it('显式站内模式优先于浏览器记忆，标签与关键词组合查询', async () => {
  localStorage.setItem('nav-search-mode', 'web');
  app = await mount(<Host initial={{ mode: 'site', q: 'React', tag: 'react' }} />);
  expect(api.searchBookmarks).toHaveBeenCalledWith(
    'React',
    expect.objectContaining({ tag: 'react' }),
    expect.any(AbortSignal),
  );
  expect(buttonWithText(app.container, '站内').getAttribute('aria-pressed')).toBe('true');
});

it('展开筛选后可搜索标签，在标签、无标签和全部之间切换并保留关键词', async () => {
  vi.useRealTimers();
  app = await mount(<Host initial={{ mode: 'site', q: 'React' }} />);
  expect(app.container.querySelector('[aria-label="标签筛选"]')).toBeNull();
  const details = app.container.querySelector('details')!;
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event('toggle', { bubbles: true }));
    await import('@nav/features/navigation/FrontSearchSelect');
  });
  const trigger = app.container.querySelector<HTMLElement>('[aria-label="标签筛选"]')!;
  await click(trigger);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (option) => option.textContent === '无标签',
    )!,
  );
  expect(route.search).toMatchObject({ q: 'React', untagged: true });
  expect(route.search.tag).toBeUndefined();
  await click(trigger);
  await fill(document.querySelector<HTMLInputElement>('input[role="combobox"]')!, 'rea');
  await click(document.querySelector<HTMLElement>('[role="option"]')!);
  expect(route.search).toMatchObject({ q: 'React', tag: 'react' });
  expect(route.search.untagged).toBeUndefined();
  await click(trigger);
  await click(document.querySelector<HTMLElement>('[role="option"]')!);
  expect(route.search.q).toBe('React');
  expect(route.search.tag).toBeUndefined();
  expect(route.search.untagged).toBeUndefined();
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

it('退出身份后卸载私有数据与缓存，取消旧请求', async () => {
  auth.authed = true;
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [item(8, '私有网站')], nextCursor: null });
  app = await mount(<Host initial={{ category: '开发' }} />);
  expect(app.container.textContent).toContain('私有网站');
  const signals = vi.mocked(api.getBookmarks).mock.calls.map((call) => call[1]!);
  auth.authed = false;
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [item(9, '公开网站')], nextCursor: null });
  await act(() => route.setSearch({ mode: 'site', category: '开发' }));
  expect(app.container.textContent).not.toContain('私有网站');
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(app.container.textContent).toContain('公开网站');
});

it('只请求选中的分类，失败可原地重试，其他分类仍可切换', async () => {
  app = await mount(<Host />);
  expect(api.getBookmarks).toHaveBeenCalledTimes(1);
  const nav = app.container.querySelector('[aria-label="分类导航"]') as HTMLElement;
  vi.mocked(api.getBookmarks).mockRejectedValueOnce(new Error('工具加载失败'));
  await click(buttonWithText(nav, '工具'));
  expect(app.container.querySelector('[role="alert"]')?.textContent).toContain('工具加载失败');
  await click(buttonWithText(nav, '阅读'));
  expect(app.container.querySelector('#section-category-阅读')?.textContent).toContain('网站3');
  await click(buttonWithText(nav, '工具'));
  await click(buttonWithText(app.container, '重试'));
  expect(app.container.querySelector('#section-category-工具')?.textContent).toContain('网站2');
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
    '开发',
    expect.any(Object),
    expect.any(AbortSignal),
  );
});

it('二级深链接展示全部同级分组，侧栏高亮所属一级', async () => {
  app = await mount(<Host initial={{ category: '开发' }} />);
  const tools = app.container.querySelector('#section-category-工具') as HTMLElement;
  expect(tools.querySelector('[aria-current="location"] h3')?.textContent).toBe('开发');
  expect(tools.querySelectorAll('h3')).toHaveLength(4);
  expect(tools.querySelector('button')).toBeNull();
  expect(
    buttonWithText(
      app.container.querySelector('[aria-label="分类导航"]') as HTMLElement,
      '工具',
    ).getAttribute('aria-current'),
  ).toBe('location');
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
});

it('一级点击保留关键词标签，聚合搜索后清除恢复所有分类分组', async () => {
  app = await mount(
    <Host initial={{ category: '开发', q: 'React', tag: 'react', mode: 'site' }} />,
  );
  expect(api.searchBookmarks).toHaveBeenLastCalledWith(
    'React',
    expect.objectContaining({ category: '开发', tag: 'react' }),
    expect.any(AbortSignal),
  );
  await click(
    buttonWithText(app.container.querySelector('[aria-label="分类导航"]') as HTMLElement, '工具'),
  );
  expect(route.search).toMatchObject({ category: '工具', q: 'React', tag: 'react' });
  expect(api.searchBookmarks).toHaveBeenLastCalledWith(
    'React',
    expect.objectContaining({ category: '工具', tag: 'react' }),
    expect.any(AbortSignal),
  );
  await click(buttonWithText(app.container, '清除搜索与筛选'));
  expect(route.search.category).toBe('工具');
  expect(route.search.q).toBeUndefined();
  expect(route.search.tag).toBeUndefined();
  expect(app.container.querySelectorAll('#section-category-工具 h3')).toHaveLength(4);
});

it('二级深链接重新挂载仍定位对应分组，不读取其他一级', async () => {
  app = await mount(<Host initial={{ category: 'React' }} />);
  expect(
    app.container.querySelector('#section-category-React[aria-current="location"] h3')?.textContent,
  ).toBe('React');
  expect(api.getBookmarks).toHaveBeenCalledTimes(4);
  expect(app.container.querySelector('#section-category-阅读')).toBeNull();
  await app.cleanup();
  app = await mount(<Host initial={{ category: 'React' }} />);
  expect(
    app.container.querySelector('#section-category-React[aria-current="location"] h3')?.textContent,
  ).toBe('React');
});

it('后退前进恢复当前分类、筛选与滚动，不重新请求已缓存内容', async () => {
  app = await mount(<Host initial={{ category: '开发' }} />);
  const earlier = { search: route.search, key: route.key };
  Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
  window.dispatchEvent(new Event('scroll'));
  await click(
    buttonWithText(app.container.querySelector('[aria-label="分类导航"]') as HTMLElement, '阅读'),
  );
  const later = { search: route.search, key: route.key };
  Object.defineProperty(window, 'scrollY', { value: 1250, configurable: true });
  window.dispatchEvent(new Event('scroll'));
  const count = vi.mocked(api.getBookmarks).mock.calls.length;
  await act(() => route.setSearch(earlier.search, earlier.key));
  expect(
    app.container.querySelector('#section-category-开发[aria-current="location"] h3')?.textContent,
  ).toBe('开发');
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: 'instant' });
  Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
  await act(() => route.setSearch(later.search, later.key));
  expect(app.container.querySelector('#section-category-阅读')).not.toBeNull();
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 1250, behavior: 'instant' });
  expect(api.getBookmarks).toHaveBeenCalledTimes(count);
});

it('常用更新后的新读取采用服务端记录，不被本页旧覆盖遮蔽', async () => {
  auth.authed = true;
  vi.mocked(api.updateBookmark).mockResolvedValue({ ...item(2), isPinned: true });
  app = await mount(<Host initial={{ category: '工具' }} />);
  const section = app.container.querySelector<HTMLElement>('#section-category-工具')!;
  await click(section.querySelector<HTMLElement>('[aria-label="加入常用：网站2"]')!);
  vi.mocked(api.getBookmarks).mockResolvedValue({
    items: [{ ...item(2, '服务端新版'), isPinned: false }],
    nextCursor: null,
  });
  await click(
    buttonWithText(app.container.querySelector('[aria-label="分类导航"]') as HTMLElement, '阅读'),
  );
  const nextSection = app.container.querySelector('#section-category-阅读')!;
  expect(nextSection.textContent).toContain('服务端新版');
  expect(nextSection.querySelector('[aria-label="加入常用：服务端新版"]')).not.toBeNull();
});

it('常用中搜索明确显示全库，清空回常用，未知分类回默认并提示', async () => {
  app = await mount(<Host initial={{ q: 'React', mode: 'site' }} />);
  expect(app.container.querySelector('h2')?.textContent).toBe('全部书签');
  expect(api.searchBookmarks).toHaveBeenLastCalledWith(
    'React',
    expect.objectContaining({ pinned: undefined, category: undefined }),
    expect.any(AbortSignal),
  );
  await click(buttonWithText(app.container, '清除搜索与筛选'));
  expect(app.container.querySelector('h2')?.textContent).toBe('常用网站');
  await act(() => route.setSearch({ category: 'missing' }));
  expect(route.search.category).toBeUndefined();
  expect(app.container.textContent).toContain('分类不存在或无权访问');
});

it('搜索去抖等待期间切换分类仍保留输入，并在新分类内查询', async () => {
  app = await mount(<Host />);
  await fill(app.container.querySelector('input')!, '云服务');
  await click(
    buttonWithText(app.container.querySelector('[aria-label="分类导航"]') as HTMLElement, '工具'),
  );
  expect(route.search).toMatchObject({ category: '工具', q: '云服务' });
  expect(app.container.querySelector('input')?.value).toBe('云服务');
  expect(api.searchBookmarks).toHaveBeenLastCalledWith(
    '云服务',
    expect.objectContaining({ category: '工具' }),
    expect.any(AbortSignal),
  );
});

it('默认常用与分类索引并行加载，不因索引延迟阻塞书签', async () => {
  let finish!: (value: Category[]) => void;
  vi.mocked(api.getCategories).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  app = await mount(<Host />);
  expect(api.getBookmarks).toHaveBeenCalledOnce();
  expect(app.container.querySelector('#section-common')?.textContent).toContain('网站1');
  await act(() => finish([]));
  expect(api.getBookmarks).toHaveBeenCalledOnce();
});

it('分组独立追加与重试，空二级保留标题，返回一级恢复追加内容', async () => {
  let fail = true;
  vi.mocked(api.getBookmarks).mockImplementation(async (options) => {
    if (options?.category === '工具' || options?.category === '前端')
      return { items: [], nextCursor: null };
    if (options?.category === '开发') {
      if (options.cursor && fail) {
        fail = false;
        throw new Error('开发追加失败');
      }
      return {
        items: options.cursor ? [item(22)] : [item(12)],
        nextCursor: options.cursor ? null : 'dev-next',
      };
    }
    return { items: [item(15)], nextCursor: null };
  });
  app = await mount(<Host initial={{ category: '工具' }} />);
  expect(app.container.querySelector('#section-category-工具-direct')).toBeNull();
  expect(app.container.querySelector('#section-category-前端')?.textContent).toContain(
    '这个分类还没有网站',
  );
  const dev = app.container.querySelector('#section-category-开发') as HTMLElement;
  await click(buttonWithText(dev, '展开更多'));
  expect(dev.textContent).toContain('开发追加失败');
  expect(dev.textContent).toContain('网站12');
  expect(app.container.querySelector('#section-category-React')?.textContent).toContain('网站15');
  await click(buttonWithText(dev, '重试'));
  expect(dev.textContent).toContain('网站22');
  expect(api.getBookmarks).toHaveBeenLastCalledWith(
    expect.objectContaining({
      category: '开发',
      categoryOnly: true,
      cursor: 'dev-next',
      limit: 24,
    }),
    expect.any(AbortSignal),
  );
  const nav = app.container.querySelector('[aria-label="分类导航"]') as HTMLElement;
  await click(buttonWithText(nav, '阅读'));
  const count = vi.mocked(api.getBookmarks).mock.calls.length;
  await click(buttonWithText(nav, '工具'));
  expect(app.container.querySelector('#section-category-开发')?.textContent).toContain('网站22');
  expect(api.getBookmarks).toHaveBeenCalledTimes(count);
});

it('快速切换一级取消全部分组请求，迟到响应不进入新内容或缓存', async () => {
  const pending: (() => void)[] = [];
  vi.mocked(api.getBookmarks).mockImplementation((options) => {
    if (['工具', '开发', '前端', 'React'].includes(options?.category ?? '')) {
      return new Promise((resolve) =>
        pending.push(() => resolve({ items: [item(99, '迟到旧内容')], nextCursor: null })),
      );
    }
    return Promise.resolve({ items: [item(3)], nextCursor: null });
  });
  app = await mount(<Host initial={{ category: '工具' }} />);
  const old = vi.mocked(api.getBookmarks).mock.calls.map((call) => call[1]!);
  await click(
    buttonWithText(app.container.querySelector('[aria-label="分类导航"]') as HTMLElement, '阅读'),
  );
  expect(old).toHaveLength(4);
  expect(old.every((signal) => signal.aborted)).toBe(true);
  await act(() => pending.forEach((resolve) => resolve()));
  expect(app.container.textContent).not.toContain('迟到旧内容');
  expect(app.container.querySelector('#section-category-阅读')?.textContent).toContain('网站3');
  await click(
    buttonWithText(app.container.querySelector('[aria-label="分类导航"]') as HTMLElement, '工具'),
  );
  expect(api.getBookmarks).toHaveBeenCalledTimes(10);
  expect(app.container.textContent).not.toContain('迟到旧内容');
});
