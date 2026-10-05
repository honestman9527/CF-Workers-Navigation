// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';

import { WebsitesTab } from '@nav/features/admin/WebsitesTab';

import { buttonWithText, click, mount } from '../../render';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), query: vi.fn(), auth: { logout: vi.fn() } }));
vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => mocks.auth }));
vi.mock('@nav/components/Toast', () => ({ pushToast: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ Toaster: () => null }));
vi.mock('@nav/hooks/useApiData', () => ({ useApiData: () => ({ data: [], refresh: vi.fn() }) }));
vi.mock('@nav/features/bookmarks/usePagedBookmarks', () => ({
  PAGE_SIZES: [10, 20, 50, 100],
  usePagedBookmarks: (options: unknown) => {
    mocks.query(options);
    return {
      items: [],
      loading: false,
      error: '连接失败',
      total: 0,
      page: 1,
      totalPages: 1,
      refresh: mocks.refresh,
    };
  },
}));

it('加载失败显示错误和重试，不误报为空结果', async () => {
  const app = await mount(<WebsitesTab />);
  try {
    expect(app.container.textContent).toContain('连接失败');
    expect(app.container.textContent).not.toContain('没有符合条件的书签');
    await click(buttonWithText(app.container, '重试'));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  } finally {
    await app.cleanup();
  }
});

it('状态始终保持单选，重复点击不会清空，离开使用中会清除仅常用', async () => {
  const app = await mount(<WebsitesTab />);
  try {
    await click(buttonWithText(app.container, '全部'));
    expect(buttonWithText(app.container, '全部').getAttribute('aria-pressed')).toBe('true');
    await click(buttonWithText(app.container, '使用中'));
    await click(app.container.querySelector<HTMLElement>('[role="checkbox"]')!);
    expect(mocks.query.mock.calls.at(-1)?.[0]).toMatchObject({ view: 'active', pinned: true });
    await click(buttonWithText(app.container, '已归档'));
    expect(mocks.query.mock.calls.at(-1)?.[0]).toMatchObject({ view: 'archive', pinned: false });
    expect(app.container.querySelector('[role="checkbox"]')).toBeNull();
    expect(
      app.container.querySelectorAll('[data-slot="toggle-group-item"][aria-pressed="true"]'),
    ).toHaveLength(1);
  } finally {
    await app.cleanup();
  }
});

it('方向键可聚焦下一个状态', async () => {
  const app = await mount(<WebsitesTab />);
  try {
    const all = buttonWithText(app.container, '全部');
    await act(() => {
      all.focus();
      all.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement === buttonWithText(app.container, '使用中')).toBe(true);
  } finally {
    await app.cleanup();
  }
});
