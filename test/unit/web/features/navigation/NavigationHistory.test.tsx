// @vitest-environment jsdom
import type { Bookmark, Category } from '@shared/api/types';

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { NavigationPage } from '@nav/features/navigation/NavigationPage';
import { parseNavigationSearch } from '@nav/features/navigation/search';

import { buttonWithText, click, mount } from '../../render';

vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => ({ authed: false }) }));
vi.mock('@nav/features/layout/BrandIcon', () => ({ BrandIcon: () => null }));
vi.mock('@nav/hooks/useSettings', () => ({
  useSettings: () => ({ settings: null, loading: false, error: null, retry: vi.fn() }),
}));
vi.mock('@nav/hooks/useBackground', () => ({ useBackground: () => {} }));
vi.mock('@nav/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('@nav/api/client', () => ({
  api: {
    getCategories: vi.fn(),
    getBookmarks: vi.fn(),
    getTags: vi.fn(),
    searchBookmarks: vi.fn(),
  },
  ApiError: class extends Error {},
}));

let app: Awaited<ReturnType<typeof mount>>;
afterEach(async () => {
  await app?.cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('真实Router前后退恢复多分区快照与追加内容，深层链接正确高亮且不重复锚点跳转', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.spyOn(window, 'scrollTo').mockImplementation((options: number | ScrollToOptions) => {
    if (typeof options === 'object')
      Object.defineProperty(window, 'scrollY', { configurable: true, value: options.top ?? 0 });
  });
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  vi.mocked(api.getCategories).mockResolvedValue([
    { id: 1, slug: 'tools', name: '工具', parentId: null, sortOrder: 0 },
    { id: 2, slug: 'frontend', name: '前端', parentId: 1, sortOrder: 0 },
    { id: 3, slug: 'react', name: 'React', parentId: 2, sortOrder: 0 },
    { id: 4, slug: 'reading', name: '阅读', parentId: null, sortOrder: 1 },
    { id: 5, slug: 'blogs', name: '博客', parentId: 4, sortOrder: 0 },
  ] as Category[]);
  vi.mocked(api.getTags).mockResolvedValue([]);
  vi.mocked(api.getBookmarks).mockImplementation(async (_token, options) => {
    const name = options?.category ?? 'common';
    const id = name.length + (options?.cursor ? 100 : 0);
    return {
      items: [{ id, title: `${name}-${id}`, url: `https://example.com/${id}` } as Bookmark],
      nextCursor: options?.category === 'react' && !options.cursor ? 'next' : null,
    };
  });
  const root = createRootRoute({ component: Outlet });
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    validateSearch: parseNavigationSearch,
    component: NavigationPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ['/?category=react'] }),
    scrollRestoration: ({ location }) => location.pathname !== '/',
  });
  app = await mount(<RouterProvider router={router} />);
  await act(() => router.load());
  const tools = app.container.querySelector('#section-category-tools') as HTMLElement;
  const reading = app.container.querySelector('#section-category-reading') as HTMLElement;
  expect(tools.querySelector('[aria-current="page"]')?.textContent).toBe('React');
  await click(buttonWithText(tools, '展开更多'));
  expect(tools.textContent).toContain('react-105');
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 720 });
  window.dispatchEvent(new Event('scroll'));
  await click(buttonWithText(reading, '博客'));
  expect(router.state.location.search).toMatchObject({ category: 'blogs' });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 1200 });
  window.dispatchEvent(new Event('scroll'));
  const requests = vi.mocked(api.getBookmarks).mock.calls.length;
  const anchors = vi.mocked(Element.prototype.scrollIntoView).mock.calls.length;
  await act(async () => {
    router.history.back();
    await router.load();
  });
  expect(tools.querySelector('[aria-current="page"]')?.textContent).toBe('React');
  expect(tools.textContent).toContain('react-105');
  expect(reading.querySelector('[aria-current="page"]')?.textContent).toBe('阅读');
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 720, behavior: 'instant' });
  await act(async () => {
    router.history.forward();
    await router.load();
  });
  expect(reading.querySelector('[aria-current="page"]')?.textContent).toBe('博客');
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 1200, behavior: 'instant' });
  expect(api.getBookmarks).toHaveBeenCalledTimes(requests);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(anchors);
});
