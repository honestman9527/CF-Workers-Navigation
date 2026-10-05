// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

import { WebsitesTab } from '@nav/features/admin/WebsitesTab';

import { buttonWithText, click, mount } from '../../render';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), auth: { logout: vi.fn() } }));
vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => mocks.auth }));
vi.mock('@nav/components/Toast', () => ({ pushToast: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ Toaster: () => null }));
vi.mock('@nav/hooks/useApiData', () => ({ useApiData: () => ({ data: [], refresh: vi.fn() }) }));
vi.mock('@nav/features/bookmarks/usePagedBookmarks', () => ({
  PAGE_SIZES: [10, 20, 50, 100],
  usePagedBookmarks: () => ({
    items: [],
    loading: false,
    error: '连接失败',
    total: 0,
    page: 1,
    totalPages: 1,
    refresh: mocks.refresh,
  }),
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
