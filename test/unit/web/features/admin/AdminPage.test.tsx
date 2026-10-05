// @vitest-environment jsdom
import { Provider, createStore } from 'jotai';
import { act, type ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { pushToast } from '@nav/components/Toast';
import { AdminPage } from '@nav/features/admin/AdminPage';
import { themeAtom } from '@nav/features/settings/store';

import { click, mount } from '../../render';

const mocks = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('@nav/features/auth/useAuthContext', () => ({
  useAuthContext: () => ({ logout: mocks.logout }),
}));
vi.mock('@nav/components/Toast', () => ({ pushToast: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/admin' }),
  Outlet: () => <p>页面内容</p>,
  Link: ({ to, onClick, ...props }: ComponentProps<'a'> & { to: string }) => (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    />
  ),
}));

let app: Awaited<ReturnType<typeof mount>>;
const mediaListeners = new Set<() => void>();
let dark = false;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  dark = false;
  mediaListeners.clear();
  mocks.logout.mockResolvedValue(undefined);
});
afterEach(async () => {
  await app?.cleanup();
});

async function setup(width = 1440) {
  const themeMedia = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener),
  };
  window.matchMedia = vi
    .fn()
    .mockImplementation((query: string) =>
      query.includes('prefers-color')
        ? themeMedia
        : { matches: width < 1024, addEventListener() {}, removeEventListener() {} },
    );
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  const store = createStore();
  store.set(themeAtom, 'light');
  app = await mount(
    <Provider store={store}>
      <AdminPage />
    </Provider>,
  );
  return store;
}
function button(label: string) {
  return document.querySelector<HTMLButtonElement>('button[aria-label="' + label + '"]')!;
}
function menuItem(text: string) {
  return [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(
    (item) => item.textContent?.trim() === text,
  )!;
}
async function openMenu() {
  const trigger = button('更多管理操作');
  if (trigger.getAttribute('aria-expanded') !== 'true') await click(trigger);
}

it('底部返回跟随偏好，桌面收起恢复且隐藏内容不可聚焦', async () => {
  localStorage.setItem('nav-front-view', 'workspace');
  await setup();
  const footer = app.container.querySelector('[data-sidebar="footer"]')!;
  expect(footer.querySelector('a')?.getAttribute('href')).toBe('/workspace');
  expect(footer.textContent).toContain('返回书签柜');
  expect(footer.textContent).not.toContain('退出登录');
  await click(button('收起管理导航'));
  expect(localStorage.getItem('nav-admin-sidebar-open')).toBe('false');
  expect(
    app.container.querySelector('[data-sidebar="content"]')?.parentElement?.hasAttribute('inert'),
  ).toBe(true);
  await app.cleanup();
  await setup();
  expect(button('展开管理导航').getAttribute('aria-expanded')).toBe('false');
  await act(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })),
  );
  expect(button('收起管理导航').getAttribute('aria-expanded')).toBe('true');
});

it('三种主题直接可选，键盘关闭菜单后焦点返回；收起时系统主题仍更新', async () => {
  const store = await setup();
  const more = button('更多管理操作');
  more.focus();
  await act(() =>
    more.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(document.querySelector('[role="group"][aria-label="主题"]')).not.toBeNull();
  await click(menuItem('暗色'));
  expect(store.get(themeAtom)).toBe('dark');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  await openMenu();
  await click(menuItem('亮色'));
  expect(store.get(themeAtom)).toBe('light');
  await openMenu();
  await click(menuItem('跟随系统'));
  expect(store.get(themeAtom)).toBe('system');
  await openMenu();
  await act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  expect(more.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(more);
  await click(button('收起管理导航'));
  await act(() => {
    dark = true;
    mediaListeners.forEach((listener) => listener());
  });
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});

it('移动抽屉中切换主题保留抽屉，返回后关闭且不改变桌面偏好', async () => {
  localStorage.setItem('nav-admin-sidebar-open', 'false');
  await setup(375);
  await click(button('展开管理导航'));
  await openMenu();
  await click(menuItem('暗色'));
  expect(button('收起管理导航').getAttribute('aria-expanded')).toBe('true');
  const link = document.querySelector<HTMLAnchorElement>('[data-sidebar="footer"] a')!;
  expect(link.getAttribute('href')).toBe('/launch');
  await click(link);
  expect(button('展开管理导航').getAttribute('aria-expanded')).toBe('false');
  expect(localStorage.getItem('nav-admin-sidebar-open')).toBe('false');
});

it('退出期间禁用重复操作，失败提示后可重新打开菜单重试', async () => {
  let reject!: (error: Error) => void;
  mocks.logout.mockImplementationOnce(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  await setup();
  await openMenu();
  await click(menuItem('退出登录'));
  await openMenu();
  expect(menuItem('退出中…').getAttribute('aria-disabled')).toBe('true');
  await click(menuItem('退出中…'));
  expect(mocks.logout).toHaveBeenCalledOnce();
  await act(async () => reject(new Error('network')));
  expect(pushToast).toHaveBeenCalledWith('退出登录失败，请重试', 'error');
  await click(menuItem('退出登录'));
  expect(mocks.logout).toHaveBeenCalledTimes(2);
});
