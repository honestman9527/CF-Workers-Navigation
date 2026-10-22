// @vitest-environment jsdom
import type { Bookmark, BookmarkInput } from '@shared/api/types';

import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { pushToast } from '@nav/components/Toast';
import { WebsitesTab } from '@nav/features/admin/WebsitesTab';

import { buttonWithText, click, mount } from '../../render';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  query: vi.fn(),
  auth: { logout: vi.fn() },
  items: [] as Bookmark[],
  error: '连接失败' as string | null,
}));
vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => mocks.auth }));
vi.mock('@nav/components/Toast', () => ({ pushToast: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ Toaster: () => null }));
vi.mock('@nav/api/client', () => ({
  api: {
    getTags: vi.fn(),
    getCategories: vi.fn(),
    updateBookmark: vi.fn(),
    createBookmark: vi.fn(),
  },
  ApiError: class extends Error {},
}));
vi.mock('@nav/features/bookmarks/BookmarkForm', () => ({
  BookmarkForm: ({ onSubmit }: { onSubmit: (input: BookmarkInput) => Promise<void> }) => (
    <button onClick={() => void onSubmit({ title: '新增网站', url: 'https://new.example.com' })}>
      提交测试草稿
    </button>
  ),
}));
vi.mock('@nav/features/bookmarks/usePagedBookmarks', () => ({
  PAGE_SIZES: [10, 20, 50, 100],
  usePagedBookmarks: (options: unknown) => {
    mocks.query(options);
    return {
      items: mocks.items,
      loading: false,
      error: mocks.error,
      total: 0,
      page: 1,
      totalPages: 1,
      refresh: mocks.refresh,
    };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.items = [];
  mocks.error = '连接失败';
  vi.mocked(api.getTags).mockResolvedValue([]);
  vi.mocked(api.getCategories).mockResolvedValue([]);
});

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

it.each([
  { method: 'getCategories', label: '分类' },
  { method: 'getTags', label: '标签' },
] as const)('$label 索引首次失败有独立重试入口', async ({ method, label }) => {
  mocks.error = null;
  vi.mocked(api[method]).mockRejectedValueOnce(new Error(`${label}网络中断`));
  const app = await mount(<WebsitesTab />);
  try {
    expect(app.container.textContent).toContain(`${label}加载失败：${label}网络中断`);
    await click(buttonWithText(app.container, '重试'));
    expect(api[method]).toHaveBeenCalledTimes(2);
    expect(app.container.textContent).not.toContain(`${label}网络中断`);
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

it('保存后的标签刷新失败保留原筛选项，重试期间不重复提交读取', async () => {
  mocks.error = null;
  vi.mocked(api.getTags)
    .mockResolvedValueOnce([{ id: 1, name: '保留标签', slug: 'kept', bookmarkCount: 1 }])
    .mockRejectedValueOnce(new Error('刷新断网'));
  vi.mocked(api.createBookmark).mockResolvedValue({ id: 2 } as Bookmark);
  const app = await mount(<WebsitesTab />);
  try {
    await click(buttonWithText(app.container, '添加书签'));
    await click(buttonWithText(app.container, '提交测试草稿'));
    expect(app.container.textContent).toContain('标签加载失败：刷新断网');
    expect(app.container.querySelector('select[aria-label="按标签筛选"]')?.textContent).toContain(
      '保留标签',
    );
    let finish!: (value: []) => void;
    vi.mocked(api.getTags).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const retry = buttonWithText(app.container, '重试');
    await click(retry);
    await click(retry);
    expect(api.getTags).toHaveBeenCalledTimes(3);
    await act(() => finish([]));
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

it('后台常用操作刷新页码列表，保留分类和标签索引', async () => {
  mocks.error = null;
  const bookmark: Bookmark = {
    id: 1,
    title: '网站',
    url: 'https://example.com',
    tags: [],
    categoryId: null,
    archivedAt: null,
    deletedAt: null,
    isPinned: false,
    visibility: 'public',
    effectiveVisibility: 'public',
    description: null,
    iconUrl: null,
    categorySlug: null,
    categoryName: null,
    createdAt: '2026-10-01 00:00:00',
    updatedAt: '2026-10-01 00:00:00',
  };
  mocks.items = [bookmark];
  vi.mocked(api.updateBookmark).mockResolvedValue({ ...bookmark, isPinned: true });
  const app = await mount(<WebsitesTab />);
  try {
    await click(app.container.querySelector('[aria-label="加入常用"]')!);
    expect(api.updateBookmark).toHaveBeenCalledWith(1, { isPinned: true });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(api.getTags).toHaveBeenCalledOnce();
    expect(api.getCategories).toHaveBeenCalledOnce();
    expect(pushToast).toHaveBeenCalledWith('已加入常用', 'success');
  } finally {
    await app.cleanup();
  }
});

it('后台编辑保存通过共同规则刷新内容和索引并关闭编辑器', async () => {
  mocks.error = null;
  vi.mocked(api.createBookmark).mockResolvedValue({ id: 2, title: '新增网站' } as Bookmark);
  const app = await mount(<WebsitesTab />);
  try {
    await click(buttonWithText(app.container, '添加书签'));
    await click(buttonWithText(app.container, '提交测试草稿'));
    expect(api.createBookmark).toHaveBeenCalledWith({
      title: '新增网站',
      url: 'https://new.example.com',
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(api.getTags).toHaveBeenCalledTimes(2);
    expect(api.getCategories).toHaveBeenCalledTimes(2);
    expect(app.container.textContent).not.toContain('提交测试草稿');
    expect(pushToast).toHaveBeenCalledWith('书签已创建', 'success');
  } finally {
    await app.cleanup();
  }
});
