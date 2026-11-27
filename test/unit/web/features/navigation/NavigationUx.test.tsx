import type { ReactNode } from 'react';

import type { NavigationSearch } from '@nav/features/navigation/search';
// @vitest-environment jsdom
import type { Bookmark, Category } from '@shared/api/types';

import { FRONT_SIDEBAR_STORAGE_KEY, PALETTE_STORAGE_KEY, VIEW_DENSITY_STORAGE_KEY } from '@shared';
import { Provider, createStore } from 'jotai';
import { act, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { NavigationPage } from '@nav/features/navigation/NavigationPage';
import {
  bgOverlayOpacityAtom,
  frontSidebarOpenAtom,
  paletteAtom,
  viewDensityAtom,
} from '@nav/features/settings/store';

import { buttonWithText, click, fill, mount } from '../../render';

const { auth, route, navigate, themeState } = vi.hoisted(() => ({
  auth: { authed: false, logout: vi.fn() },
  route: {
    search: {} as NavigationSearch,
    key: 'initial',
    nextKey: 0,
    setSearch: (_value: NavigationSearch, _key?: string) => {},
  },
  navigate: vi.fn(),
  themeState: {
    theme: 'light' as 'light' | 'dark' | 'system',
    setTheme: vi.fn(),
  },
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useSearch: () => route.search }),
  useLocation: () => ({ state: { __TSR_key: route.key }, href: '/', search: route.search }),
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => auth }));
vi.mock('@nav/features/layout/BrandIcon', () => ({
  BrandIcon: () => <span data-testid="brand-icon" />,
}));
vi.mock('@nav/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: themeState.theme,
    resolvedTheme: themeState.theme === 'dark' ? 'dark' : 'light',
    setTheme: themeState.setTheme,
  }),
}));
vi.mock('@nav/api/client', () => ({
  api: {
    getBookmarks: vi.fn(),
    searchBookmarks: vi.fn(),
    getCategories: vi.fn(),
    getTags: vi.fn(),
    getPublicSettings: vi.fn(),
    updateBookmark: vi.fn(),
    copyBookmark: vi.fn(),
    reorderBookmarks: vi.fn(),
    deleteBookmark: vi.fn(),
  },
  ApiError: class extends Error {},
}));

let app: Awaited<ReturnType<typeof mount>>;

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 1,
    title: 'Cloudflare Docs',
    url: 'https://developers.cloudflare.com',
    description: '边缘计算与 Workers 官方文档',
    iconUrl: null,
    sortOrder: 0,
    visibility: 'public',
    effectiveVisibility: 'public',
    categoryId: 2,
    categorySlug: 'dev',
    categoryName: '开发文档',
    tags: ['Workers', 'Edge', 'TypeScript', 'ExtraTag'],
    archivedAt: null,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    parentId: null,
    systemKey: null,
    name: '工程工具',
    slug: 'tools',
    icon: null,
    sortOrder: 1,
    bookmarkCount: 2,
    visibility: 'public',
    effectiveVisibility: 'public',
    ...overrides,
  };
}

function Host({
  initial = {},
  store: providedStore,
}: {
  initial?: NavigationSearch;
  store?: ReturnType<typeof createStore>;
}) {
  const [store] = useState(() => providedStore ?? createStore());
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
  document.documentElement.className = 'light';
  document.documentElement.dataset.palette = 'indigo';
  delete document.documentElement.dataset.frontSidebar;
  document.documentElement.style.removeProperty('--bg-overlay-opacity');
  document.documentElement.style.removeProperty('--bg-image');
  route.nextKey = 0;
  auth.authed = false;
  themeState.theme = 'light';
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
    makeCategory({
      id: 10,
      name: '常用',
      slug: 'common',
      systemKey: 'common',
      icon: 'Star',
      sortOrder: 0,
      bookmarkCount: 2,
    }),
    makeCategory({ id: 1, name: '工程工具', slug: 'tools', bookmarkCount: 1 }),
    makeCategory({
      id: 2,
      parentId: 1,
      name: '开发文档',
      slug: 'dev',
      bookmarkCount: 3,
      visibility: 'private',
      effectiveVisibility: 'private',
    }),
    makeCategory({ id: 3, name: '设计灵感', slug: 'design', bookmarkCount: 2 }),
  ]);
  vi.mocked(api.getTags).mockResolvedValue([
    { id: 1, name: 'Workers', slug: 'workers', bookmarkCount: 2 },
    { id: 2, name: 'Edge', slug: 'edge', bookmarkCount: 1 },
  ]);
  vi.mocked(api.getPublicSettings).mockResolvedValue({
    searchEngines: [],
    defaultEngineId: 'google',
    backgroundImageUrl: 'https://example.com/bg.jpg',
    backgroundImageEnabled: true,
  });
  vi.mocked(api.getBookmarks).mockResolvedValue({
    items: [
      makeBookmark(),
      makeBookmark({
        id: 2,
        title: '内部控制台',
        url: 'https://internal.example.com',
        visibility: 'private',
        effectiveVisibility: 'private',
        tags: ['Ops'],
      }),
    ],
    nextCursor: null,
  });
  vi.mocked(api.searchBookmarks).mockResolvedValue({
    items: [
      makeBookmark({ id: 9, title: 'Vite 官方文档', url: 'https://vite.dev', tags: ['Vite'] }),
    ],
    nextCursor: null,
  });
  vi.mocked(api.deleteBookmark).mockResolvedValue(undefined);
});

afterEach(async () => {
  await app?.cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('支持舒适/紧凑视图密度切换并持久化到 localStorage', async () => {
  const store = createStore();
  store.set(viewDensityAtom, 'comfortable');
  app = await mount(<Host store={store} />);
  expect(app.container.querySelector('li[data-density="comfortable"]')).not.toBeNull();
  await click(app.container.querySelector<HTMLElement>('[aria-label="紧凑网格视图"]')!);
  expect(store.get(viewDensityAtom)).toBe('compact');
  expect(localStorage.getItem(VIEW_DENSITY_STORAGE_KEY)).toBe('compact');
  expect(app.container.querySelector('li[data-density="compact"]')).not.toBeNull();
});

it('卡片展示最多 3 个可点击标签微章、所属分类与私有标识，支持 +N 展开、激活高亮及命令面板按标签筛选', async () => {
  vi.useRealTimers();
  vi.mocked(api.searchBookmarks).mockResolvedValue({
    items: [
      makeBookmark(),
      makeBookmark({
        id: 2,
        title: '内部控制台',
        url: 'https://internal.example.com',
        visibility: 'private',
        effectiveVisibility: 'private',
        tags: ['Ops'],
      }),
    ],
    nextCursor: null,
  });
  app = await mount(<Host initial={{ mode: 'site', q: 'Cloudflare' }} />);
  const currentFirstCard = () => app.container.querySelectorAll('li')[0]!;
  expect(currentFirstCard().textContent).toContain('开发文档');
  expect(currentFirstCard().textContent).toContain('Workers');
  expect(currentFirstCard().textContent).toContain('Edge');
  expect(currentFirstCard().textContent).toContain('TypeScript');
  expect(currentFirstCard().textContent).not.toContain('ExtraTag');
  expect(currentFirstCard().textContent).toContain('+1');

  const secondCard = app.container.querySelectorAll('li')[1]!;
  expect(secondCard.textContent).toContain('私有');

  // 点击卡片标签激活并高亮，再次点击取消筛选
  await click(buttonWithText(currentFirstCard(), 'Workers'));
  expect(route.search).toMatchObject({ mode: 'site', tag: 'workers' });
  expect(buttonWithText(currentFirstCard(), 'Workers').getAttribute('aria-pressed')).toBe('true');

  await click(buttonWithText(currentFirstCard(), 'Workers'));
  expect(route.search.tag).toBeUndefined();

  // 点击 +1 展开其余标签浮层并点选 ExtraTag
  await click(
    currentFirstCard().querySelector<HTMLElement>(
      '[aria-label="查看其余 1 个标签：Cloudflare Docs"]',
    )!,
  );
  const extraPopup = document.querySelector<HTMLElement>(
    '[aria-label="更多标签：Cloudflare Docs"]',
  )!;
  expect(extraPopup).not.toBeNull();
  await click(buttonWithText(extraPopup, 'ExtraTag'));
  expect(route.search).toMatchObject({ mode: 'site', tag: 'ExtraTag' });

  // 命令面板支持 #标签 检索并切换筛选
  await act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
    );
  });
  const cmdDialog = document.querySelector<HTMLElement>('[aria-label="全局命令面板"]')!;
  const cmdInput = cmdDialog.querySelector<HTMLInputElement>('input')!;
  await fill(cmdInput, '#workers');
  const tagOption = [...cmdDialog.querySelectorAll<HTMLElement>('[role="option"]')].find((el) =>
    el.textContent?.includes('Workers'),
  )!;
  await click(tagOption);
  expect(route.search).toMatchObject({ mode: 'site', tag: 'workers' });
});

it('管理员可通过卡片复制到分类，禁选当前分类并显示继承私有提示与一键复制到常用', async () => {
  vi.useRealTimers();
  auth.authed = true;
  vi.mocked(api.getBookmarks).mockResolvedValue({
    items: [
      makeBookmark({
        id: 1,
        title: 'Cloudflare Docs',
        categoryId: 2,
        categorySlug: 'dev',
        categoryName: '开发文档',
        visibility: 'public',
        effectiveVisibility: 'private',
      }),
    ],
    nextCursor: null,
  });
  vi.mocked(api.copyBookmark).mockResolvedValue(
    makeBookmark({
      id: 100,
      categoryId: 10,
      categorySlug: 'common',
      categoryName: '常用',
      visibility: 'private',
      effectiveVisibility: 'private',
    }),
  );

  app = await mount(<Host initial={{ category: 'dev' }} />);
  await click(
    app.container.querySelector<HTMLElement>('[aria-label="复制到分类：Cloudflare Docs"]')!,
  );
  const popup = document.querySelector<HTMLElement>(
    '[aria-label="复制「Cloudflare Docs」到分类"]',
  )!;
  expect(popup).not.toBeNull();
  expect(popup.textContent).toContain('继承了私有权限');
  const currentOption = [...popup.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((el) =>
    el.textContent?.includes('开发文档'),
  )!;
  expect(currentOption.getAttribute('aria-disabled')).toBe('true');

  await click(buttonWithText(popup, '复制到「常用」'));
  expect(api.copyBookmark).toHaveBeenCalledWith(1, 10);
  expect(app.container.textContent).toContain('已复制到「常用」');
});

it('管理员点击卡片删除弹出确认框，确认后移入回收站并刷新列表', async () => {
  auth.authed = true;
  app = await mount(<Host />);
  await click(app.container.querySelector<HTMLElement>('[aria-label="删除：Cloudflare Docs"]')!);
  expect(document.body.textContent).toContain('移入回收站「Cloudflare Docs」？');
  const confirmButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (btn) => btn.textContent?.trim() === '确认移入回收站',
  )!;
  await click(confirmButton);
  expect(api.deleteBookmark).toHaveBeenCalledWith(1);
  expect(app.container.textContent).toContain('已移入回收站，可在后台恢复');
});

it('移动端抽屉完整保留两级分类树折叠/展开、计数与选择跳转，底部使用统一单行工具栏', async () => {
  app = await mount(<Host />);
  await click(app.container.querySelector<HTMLElement>('[aria-label="打开分类导航"]')!);
  const drawer = document.querySelector<HTMLElement>('[aria-label="分类导航抽屉"]')!;
  expect(drawer).not.toBeNull();
  expect(drawer.querySelector('[aria-label="管理员登录"]')?.textContent?.trim()).toBe('登录');
  expect(drawer.querySelector('[aria-label="外观与主题设置"]')).not.toBeNull();
  expect(drawer.querySelector('[aria-label="抽屉主题切换"]')).toBeNull();

  const toggle = drawer.querySelector<HTMLButtonElement>('[aria-label="展开 工程工具"]')!;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await click(toggle);
  expect(drawer.textContent).toContain('开发文档');
  await click(buttonWithText(drawer, '开发文档'));
  expect(route.search).toMatchObject({ category: 'dev' });
});

it('全局命令面板支持 Cmd/Ctrl+K 唤起、搜索书签、键盘回车跳转、主题色切换与 Esc 关闭', async () => {
  auth.authed = true;
  const store = createStore();
  store.set(paletteAtom, 'indigo');
  app = await mount(<Host store={store} />);

  await act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
    );
  });
  const dialog = document.querySelector<HTMLElement>('[aria-label="全局命令面板"]')!;
  expect(dialog).not.toBeNull();
  const cmdInput = dialog.querySelector<HTMLInputElement>('input')!;

  // 检索书签并回车打开
  await fill(cmdInput, 'Vite');
  await act(() => vi.advanceTimersByTimeAsync(220));
  expect(api.searchBookmarks).toHaveBeenCalledWith(
    'Vite',
    expect.objectContaining({ view: 'active', limit: 8 }),
    expect.any(AbortSignal),
  );
  await act(() => {
    cmdInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(window.open).toHaveBeenCalledWith('https://vite.dev', '_blank', 'noopener,noreferrer');

  // 再次 Ctrl+K 打开并切换主题色
  await act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
    );
  });
  const dialog2 = document.querySelector<HTMLElement>('[aria-label="全局命令面板"]')!;
  const cmdInput2 = dialog2.querySelector<HTMLInputElement>('input')!;
  await fill(cmdInput2, '翡翠森语');
  await act(() => {
    cmdInput2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(store.get(paletteAtom)).toBe('emerald');
  expect(document.documentElement.dataset.palette).toBe('emerald');
  expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('emerald');
});

it('统一主题与主题色菜单精简去除重复项并应用到根节点，背景遮罩偏好仍自动生效', async () => {
  vi.useRealTimers();
  const store = createStore();
  store.set(paletteAtom, 'indigo');
  store.set(bgOverlayOpacityAtom, 0.72);
  app = await mount(<Host store={store} />);
  expect(document.documentElement.classList.contains('has-background')).toBe(true);
  expect(document.documentElement.style.getPropertyValue('--bg-overlay-opacity')).toBe('0.72');
  // 移动端顶栏不再与 NavigationMenu 重复渲染外观按钮，仅侧栏保留统一入口
  expect(app.container.querySelectorAll('[aria-label="外观与主题设置"]')).toHaveLength(1);

  const trigger = app.container.querySelector<HTMLButtonElement>('[aria-label="外观与主题设置"]')!;
  await click(trigger);
  const menu = document.querySelector<HTMLElement>('[role="menu"][aria-label="外观与主题设置"]')!;
  expect(menu).not.toBeNull();
  expect(menu.querySelector('#front-bg-overlay-opacity')).toBeNull();
  expect(menu.querySelector('[aria-label="视图密度"]')).toBeNull();

  const amberRadio = [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((el) =>
    el.textContent?.includes('暖珀微光'),
  )!;
  await click(amberRadio);
  expect(document.documentElement.dataset.palette).toBe('amber');
  expect(store.get(paletteAtom)).toBe('amber');
});

it('桌面侧边栏折叠时将 Logo 与展开按钮合二为一，保留焦点且支持 Cmd/Ctrl+B 与命令面板切换', async () => {
  const store = createStore();
  store.set(frontSidebarOpenAtom, true);
  app = await mount(<Host store={store} />);

  const sidebar = app.container.querySelector<HTMLElement>('#front-sidebar')!;
  expect(sidebar.dataset.state).toBe('expanded');
  expect(document.documentElement.dataset.frontSidebar).toBe('expanded');

  // 展开态底部使用克制的单行工具栏，支持一键切换明暗模式与精简入口
  expect(sidebar.querySelector('[aria-label="管理员登录"]')?.textContent?.trim()).toBe('登录');
  await click(sidebar.querySelector<HTMLButtonElement>('[aria-label="切换暗色模式"]')!);
  expect(themeState.setTheme).toHaveBeenCalledWith('dark');

  const toggle = app.container.querySelector<HTMLButtonElement>('[aria-label="收起侧边栏"]')!;
  toggle.focus();
  await click(toggle);

  expect(sidebar.dataset.state).toBe('collapsed');
  expect(document.documentElement.dataset.frontSidebar).toBe('collapsed');
  expect(localStorage.getItem(FRONT_SIDEBAR_STORAGE_KEY)).toBe('false');
  expect(app.container.querySelector('nav[data-collapsed="true"]')).not.toBeNull();
  // 折叠后不再保留独立的首页 Logo 链接，而是由合并按钮统一承载并保持焦点
  expect(sidebar.querySelector('[aria-label="书签柜首页"]')).toBeNull();
  const expandedToggle = app.container.querySelector<HTMLButtonElement>(
    '[aria-label="展开侧边栏"]',
  )!;
  expect(expandedToggle).toBe(toggle);
  expect(expandedToggle.querySelector('[data-testid="brand-icon"]')).not.toBeNull();
  expect(expandedToggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(expandedToggle);

  // 图标栏模式仍可点击一级分类切换范围
  await click(
    app.container.querySelector<HTMLButtonElement>(
      'nav[data-collapsed="true"] [aria-label="设计灵感"]',
    )!,
  );
  expect(route.search).toMatchObject({ category: 'design' });

  // Cmd/Ctrl + B 恢复展开
  await act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }),
    );
  });
  expect(sidebar.dataset.state).toBe('expanded');
  expect(localStorage.getItem(FRONT_SIDEBAR_STORAGE_KEY)).toBe('true');

  // 命令面板内可直接收起侧边栏
  await act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
    );
  });
  const dialog = document.querySelector<HTMLElement>('[aria-label="全局命令面板"]')!;
  const cmdInput = dialog.querySelector<HTMLInputElement>('input')!;
  await fill(cmdInput, '收起侧边栏');
  await act(() => {
    cmdInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(sidebar.dataset.state).toBe('collapsed');
});

it('跨标签页 storage 事件同步侧边栏折叠状态与主题色，并安全过滤非法背景图 URL', async () => {
  vi.mocked(api.getPublicSettings).mockResolvedValue({
    searchEngines: [],
    defaultEngineId: 'google',
    backgroundImageUrl: 'javascript:alert(1)',
    backgroundImageEnabled: true,
  });
  const store = createStore();
  store.set(frontSidebarOpenAtom, true);
  store.set(paletteAtom, 'indigo');
  app = await mount(<Host store={store} />);

  // 非 HTTP(S) 背景图被安全拒绝
  expect(document.documentElement.classList.contains('has-background')).toBe(false);
  expect(document.documentElement.style.getPropertyValue('--bg-image')).toBe('');

  await act(() => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: FRONT_SIDEBAR_STORAGE_KEY,
        newValue: 'false',
      }),
    );
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: PALETTE_STORAGE_KEY,
        newValue: 'rose',
      }),
    );
  });
  expect(store.get(frontSidebarOpenAtom)).toBe(false);
  expect(app.container.querySelector<HTMLElement>('#front-sidebar')!.dataset.state).toBe(
    'collapsed',
  );
  expect(store.get(paletteAtom)).toBe('rose');
  expect(document.documentElement.dataset.palette).toBe('rose');
});
