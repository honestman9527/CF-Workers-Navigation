import type { Bookmark } from '@shared/api/types';

// @vitest-environment jsdom
import { createMemoryHistory } from '@tanstack/react-router';
import { act, createElement, useCallback } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import App from '@nav/App';
import { useApiData } from '@nav/hooks/useApiData';
import { router } from '@nav/router';

import { useAuthContext } from './useAuthContext';

vi.mock('@nav/api/client', () => ({
  api: { me: vi.fn(), login: vi.fn(), logout: vi.fn(), getBookmarks: vi.fn() },
  invalidateApiRequests: vi.fn(),
  ApiError: class extends Error {},
}));
vi.mock('@nav/features/launcher/LauncherPage', () => ({
  LauncherPage: function Page() {
    const auth = useAuthContext();
    const load = useCallback((signal: AbortSignal) => api.getBookmarks(undefined, {}, signal), []);
    const { data } = useApiData(load);
    return createElement(
      'main',
      null,
      createElement('span', null, auth.authed ? '管理员' : '游客'),
      createElement('p', null, data?.items.map((item) => item.title).join(',')),
      createElement('button', { onClick: () => auth.login('password') }, '登录测试'),
      createElement('button', { onClick: () => auth.logout() }, '退出测试'),
    );
  },
}));
vi.mock('@nav/pages/LoginPage', () => ({ LoginPage: () => createElement('p', null, '登录页面') }));

function privateBookmark(title: string): Bookmark {
  return {
    id: 1,
    title,
    url: 'https://private.example.com',
    visibility: 'private',
    effectiveVisibility: 'private',
    description: null,
    iconUrl: null,
    isPinned: false,
    categoryId: null,
    categoryName: null,
    categorySlug: null,
    tags: [],
    archivedAt: null,
    deletedAt: null,
    createdAt: '2026-09-19',
    updatedAt: '2026-09-19',
  };
}
let root: Root;
let container: HTMLDivElement;
async function render(path = '/launch') {
  router.update({
    context: router.options.context,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await act(async () => root.render(createElement(App)));
  await act(async () => {
    await router.load();
  });
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === text,
  )!;
  await act(async () => {
    button.click();
  });
  await act(async () => {
    await router.load();
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.mocked(api.me).mockRejectedValue(new Error('unauthorized'));
  vi.mocked(api.login).mockResolvedValue(undefined);
  vi.mocked(api.logout).mockResolvedValue(undefined);
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [], nextCursor: null });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
it('游客可直接打开前台，后台深链要求登录并保留返回地址', async () => {
  await render('/launch?q=hello');
  expect(container.textContent).toContain('游客');
  expect(router.state.location.pathname).toBe('/launch');
  await act(async () => {
    await router.navigate({ href: '/admin/settings' });
  });
  expect(router.state.location.pathname).toBe('/login');
  expect(router.state.location.search.redirect).toBe('/admin/settings');
});
it('登录退出重新取数，取消旧私有请求且不会被迟到响应覆盖', async () => {
  await render();
  vi.mocked(api.me).mockResolvedValue({ ok: true });
  let late!: (value: Awaited<ReturnType<typeof api.getBookmarks>>) => void;
  vi.mocked(api.getBookmarks).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        late = resolve;
      }),
  );
  await click('登录测试');
  expect(container.textContent).toContain('管理员');
  const privateSignal = vi.mocked(api.getBookmarks).mock.calls.at(-1)![2];
  vi.mocked(api.me).mockRejectedValue(new Error('expired'));
  await click('退出测试');
  expect(container.textContent).toContain('游客');
  expect(privateSignal?.aborted).toBe(true);
  await act(async () => late({ items: [privateBookmark('迟到私有信息')], nextCursor: null }));
  expect(container.textContent).not.toContain('迟到私有信息');
  expect(api.getBookmarks).toHaveBeenCalledTimes(3);
});
it('服务端确认会话失效后清除已加载私有内容', async () => {
  vi.mocked(api.me).mockResolvedValue({ ok: true });
  vi.mocked(api.getBookmarks).mockResolvedValueOnce({
    items: [privateBookmark('已加载私有内容')],
    nextCursor: null,
  });
  await render();
  expect(container.textContent).toContain('已加载私有内容');
  vi.mocked(api.me).mockRejectedValue(new Error('expired'));
  await act(async () => {
    window.dispatchEvent(new Event('nav-session-expired'));
  });
  await act(async () => {
    await router.load();
  });
  expect(container.textContent).toContain('游客');
  expect(container.textContent).not.toContain('已加载私有内容');
});
