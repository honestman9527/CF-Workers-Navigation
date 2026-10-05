// @vitest-environment jsdom
import type { BookmarkPage } from '@shared/api/types';

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { LauncherPage } from '@nav/features/launcher/LauncherPage';

import { click, fill, mount } from '../../render';
import { bookmark } from './fixtures';

const { auth, navigate } = vi.hoisted(() => ({
  auth: { authed: false, logout: vi.fn() },
  navigate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useSearch: () => ({}) }),
  useNavigate: () => navigate,
}));
vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => auth }));
vi.mock('@nav/features/layout/AppHeader', () => ({ AppHeader: () => null }));
vi.mock('@nav/hooks/useSettings', () => ({ useSettings: () => null }));
vi.mock('@nav/hooks/useBackground', () => ({ useBackground: () => {} }));
vi.mock('@nav/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@nav/api/client', () => ({
  api: { getBookmarks: vi.fn(), searchBookmarks: vi.fn() },
  ApiError: class extends Error {},
}));

let app: Awaited<ReturnType<typeof mount>>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [bookmark()], nextCursor: null });
  vi.mocked(api.searchBookmarks).mockResolvedValue({ items: [bookmark(2)], nextCursor: null });
});
afterEach(async () => {
  await app?.cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function settleSearch() {
  await act(() => vi.advanceTimersByTimeAsync(251));
}

it('搜索和清空只更新主区，不取消或重取常用请求', async () => {
  let finish!: (page: BookmarkPage) => void;
  vi.mocked(api.getBookmarks).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  app = await mount(<LauncherPage />);
  const signal = vi.mocked(api.getBookmarks).mock.calls[0][2]!;
  const input = app.container.querySelector('input')!;
  await fill(input, '网站');
  await settleSearch();
  expect(signal.aborted).toBe(false);
  await act(async () => finish({ items: [bookmark()], nextCursor: null }));
  expect(app.container.querySelector('main')?.textContent).toContain('站内书签');
  expect(app.container.querySelector('nav[aria-label="常用书签"] a')?.textContent).toContain(
    '网站 1',
  );
  await click(app.container.querySelector('[aria-label="清除搜索"]')!);
  await settleSearch();
  expect(app.container.querySelector('main')?.textContent).not.toContain('站内书签');
  expect(api.getBookmarks).toHaveBeenCalledTimes(1);
  expect(signal.aborted).toBe(false);
});

it('手机聚焦收起，失焦恢复相同 Dock 节点与滚动位置，桌面聚焦不收起', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  app = await mount(<LauncherPage />);
  const input = app.container.querySelector('input')!;
  const dock = app.container.querySelector<HTMLElement>('nav[aria-label="常用书签"]')!;
  const scroller = dock.querySelector('a')!.parentElement!;
  scroller.scrollLeft = 100;
  await act(() => input.focus());
  expect(dock.hidden).toBe(true);
  await fill(input, '网站');
  await settleSearch();
  await act(() => input.blur());
  expect(dock.hidden).toBe(false);
  expect(dock.querySelector('a')!.parentElement).toBe(scroller);
  expect(scroller.scrollLeft).toBe(100);
  expect(api.getBookmarks).toHaveBeenCalledTimes(1);
});

it('桌面搜索输入时 Dock 继续显示，只有 bang 前缀时不展示空结果', async () => {
  app = await mount(<LauncherPage />);
  const input = app.container.querySelector('input')!;
  await act(() => input.focus());
  await fill(input, '!g');
  await settleSearch();
  expect(app.container.querySelector<HTMLElement>('nav[aria-label="常用书签"]')?.hidden).toBe(
    false,
  );
  expect(app.container.textContent).not.toContain('未找到匹配的书签');
  expect(api.searchBookmarks).not.toHaveBeenCalled();
});

it('常用每批 24 条，追加失败重试同一游标并保留已加载项', async () => {
  vi.mocked(api.getBookmarks)
    .mockResolvedValueOnce({
      items: Array.from({ length: 24 }, (_, index) => bookmark(index + 1)),
      nextCursor: 'page-2',
    })
    .mockRejectedValueOnce(new Error('追加失败'))
    .mockResolvedValueOnce({ items: [bookmark(25)], nextCursor: null });
  app = await mount(<LauncherPage />);
  const dock = app.container.querySelector('nav[aria-label="常用书签"]')!;
  expect(api.getBookmarks).toHaveBeenCalledWith(
    undefined,
    { pinned: true, limit: 24 },
    expect.any(AbortSignal),
  );
  await click(dock.querySelector('button')!);
  expect(dock.querySelectorAll('a')).toHaveLength(24);
  expect(dock.textContent).toContain('重试加载');
  await click(dock.querySelector('button')!);
  expect(dock.querySelectorAll('a')).toHaveLength(25);
  expect(api.getBookmarks).toHaveBeenLastCalledWith(
    undefined,
    { pinned: true, limit: 24, cursor: 'page-2' },
    expect.any(AbortSignal),
  );
  expect(dock.querySelector('button')).toBeNull();
});

it('离页取消未完成的常用请求', async () => {
  vi.mocked(api.getBookmarks).mockImplementationOnce(() => new Promise(() => {}));
  app = await mount(<LauncherPage />);
  const signal = vi.mocked(api.getBookmarks).mock.calls[0][2]!;
  await app.cleanup();
  expect(signal.aborted).toBe(true);
});
