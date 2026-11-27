// @vitest-environment jsdom
import { THEME_STORAGE_KEY } from '@shared';
import { Provider, createStore } from 'jotai';
import { act, type ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AdminPage } from '@nav/features/admin/AdminPage';
import { paletteAtom, themeAtom } from '@nav/features/settings/store';

import { click, mount } from '../../render';

const mocks = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('@nav/features/auth/useAuthContext', () => ({
  useAuthContext: () => ({ logout: mocks.logout }),
}));
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
  if (!document.querySelector('meta[name="color-scheme"]')) {
    const meta = document.createElement('meta');
    meta.name = 'color-scheme';
    meta.content = 'light dark';
    document.head.appendChild(meta);
  }
});
afterEach(async () => {
  await app?.cleanup();
  vi.restoreAllMocks();
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
async function openAppearanceMenu() {
  const trigger = button('外观与主题设置');
  if (trigger.getAttribute('aria-expanded') !== 'true') await click(trigger);
}

it('底部返回前台并与前台风格一致，桌面收起为图标栏后保留焦点与图标导航并持久化', async () => {
  localStorage.setItem('nav-front-view', 'workspace');
  await setup();
  const footer = app.container.querySelector('[data-sidebar="footer"]')!;
  expect(footer.querySelector('a')?.getAttribute('href')).toBe('/');
  expect(footer.textContent).toContain('前台');
  expect(footer.textContent).not.toContain('退出登录');

  const toggle = button('收起管理导航');
  toggle.focus();
  await click(toggle);
  expect(localStorage.getItem('nav-admin-sidebar-open')).toBe('false');
  const sidebar = app.container.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
  expect(sidebar.dataset.state).toBe('collapsed');
  expect(sidebar.dataset.collapsible).toBe('icon');
  expect(app.container.querySelector('a[aria-label="管理后台概览"]')).toBeNull();
  const expandedToggle = button('展开管理导航');
  expect(expandedToggle).toBe(toggle);
  expect(expandedToggle.querySelector('img')).not.toBeNull();
  expect(document.activeElement).toBe(expandedToggle);
  expect(app.container.querySelector('a[aria-label="书签"]')).not.toBeNull();
  expect(footer.querySelector('a[aria-label="返回前台"]')).not.toBeNull();

  await app.cleanup();
  await setup();
  expect(button('展开管理导航').getAttribute('aria-expanded')).toBe('false');
  await act(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })),
  );
  expect(button('收起管理导航').getAttribute('aria-expanded')).toBe('true');
});

it('底部支持一键明暗切换与三种主题菜单，同步 color-scheme meta 并在收起时响应系统主题', async () => {
  const store = await setup();
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')!;
  expect(meta.content).toBe('light');

  // 一键快捷切换暗色/亮色
  await click(button('切换暗色模式'));
  expect(store.get(themeAtom)).toBe('dark');
  expect(meta.content).toBe('dark');
  await click(button('切换亮色模式'));
  expect(store.get(themeAtom)).toBe('light');
  expect(meta.content).toBe('light');

  const appearanceBtn = button('外观与主题设置');
  appearanceBtn.focus();
  await act(() =>
    appearanceBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(document.querySelector('[role="group"][aria-label="主题"]')).not.toBeNull();
  await click(menuItem('暗色'));
  expect(store.get(themeAtom)).toBe('dark');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(meta.content).toBe('dark');

  await openAppearanceMenu();
  await click(menuItem('亮色'));
  expect(store.get(themeAtom)).toBe('light');
  expect(meta.content).toBe('light');

  await openAppearanceMenu();
  await click(menuItem('跟随系统'));
  expect(store.get(themeAtom)).toBe('system');
  expect(meta.content).toBe('light dark');

  await openAppearanceMenu();
  await act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  expect(appearanceBtn.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(appearanceBtn);

  await click(button('收起管理导航'));
  await act(() => {
    dark = true;
    mediaListeners.forEach((listener) => listener());
  });
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});

it('移动抽屉中切换主题保留抽屉，返回前台后关闭且不改变桌面偏好', async () => {
  localStorage.setItem('nav-admin-sidebar-open', 'false');
  await setup(375);
  await click(button('展开管理导航'));
  await openAppearanceMenu();
  await click(menuItem('暗色'));
  expect(button('收起管理导航').getAttribute('aria-expanded')).toBe('true');
  const link = document.querySelector<HTMLAnchorElement>('[data-sidebar="footer"] a')!;
  expect(link.getAttribute('href')).toBe('/');
  await click(link);
  expect(button('展开管理导航').getAttribute('aria-expanded')).toBe('false');
  expect(localStorage.getItem('nav-admin-sidebar-open')).toBe('false');
});

it('退出期间禁用重复操作，失败提示后可重试', async () => {
  let reject!: (error: Error) => void;
  mocks.logout.mockImplementationOnce(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  await setup();
  const logoutBtn = button('退出登录');
  await click(logoutBtn);
  expect(logoutBtn.disabled).toBe(true);
  await click(logoutBtn);
  expect(mocks.logout).toHaveBeenCalledOnce();
  await act(async () => reject(new Error('network')));
  expect(document.querySelector('[data-slot="toast-title"]')?.textContent).toBe(
    '退出登录失败，请重试',
  );
  expect(logoutBtn.disabled).toBe(false);
  await click(logoutBtn);
  expect(mocks.logout).toHaveBeenCalledTimes(2);
});

it('浏览器禁止存储时仍能切换主题及收起导航', async () => {
  const blocked = () => {
    throw new DOMException('Storage blocked', 'SecurityError');
  };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
  const store = await setup();
  await openAppearanceMenu();
  await click(menuItem('暗色'));
  expect(store.get(themeAtom)).toBe('dark');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  await click(button('收起管理导航'));
  expect(button('展开管理导航').getAttribute('aria-expanded')).toBe('false');
  await app.cleanup();
  const resumedStore = createStore();
  app = await mount(
    <Provider store={resumedStore}>
      <AdminPage />
    </Provider>,
  );
  expect(resumedStore.get(themeAtom)).toBe('dark');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});

it('主题写入失败时，重新挂载仍保留内存偏好，不被旧存储值覆盖', async () => {
  await setup();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  });
  await openAppearanceMenu();
  await click(menuItem('暗色'));
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  await app.cleanup();
  const store = createStore();
  app = await mount(
    <Provider store={store}>
      <AdminPage />
    </Provider>,
  );
  expect(store.get(themeAtom)).toBe('dark');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});

it('后台外观菜单支持切换 4 套主题色并同步到根节点', async () => {
  const store = await setup();
  await openAppearanceMenu();
  expect(document.querySelector('[role="group"][aria-label="主题色"]')).not.toBeNull();
  await click(menuItem('翡翠森语'));
  expect(store.get(paletteAtom)).toBe('emerald');
  expect(document.documentElement.dataset.palette).toBe('emerald');
  await openAppearanceMenu();
  await click(menuItem('玫瑰暮霞'));
  expect(store.get(paletteAtom)).toBe('rose');
  expect(document.documentElement.dataset.palette).toBe('rose');
});
