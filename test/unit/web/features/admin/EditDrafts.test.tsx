// @vitest-environment jsdom
import type { ReactNode } from 'react';

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { CategoriesTab } from '@nav/features/admin/CategoriesTab';
import { TagsTab } from '@nav/features/admin/TagsTab';

import { buttonWithText, click, fill, mount } from '../../render';

const mocks = vi.hoisted(() => ({ auth: { logout: vi.fn() } }));
vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => mocks.auth }));
vi.mock('@nav/components/Toast', () => ({ pushToast: vi.fn() }));
vi.mock('@nav/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@nav/components/DialogPanel', () => ({
  DialogPanel: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? children : null,
}));
vi.mock('@nav/features/categories/CategoryMovePicker', () => ({ CategoryMovePicker: () => null }));
vi.mock('@nav/features/visibility/VisibilityField', () => ({
  VisibilityField: () => null,
  VisibilityBadge: () => null,
  useVisibilityDefaults: () => ({ data: { defaultCategoryVisibility: 'private' }, error: null }),
}));
vi.mock('@nav/api/client', () => ({
  api: {
    getCategories: vi.fn(),
    getTags: vi.fn(),
    createCategory: vi.fn(),
    createTag: vi.fn(),
    updateCategory: vi.fn(),
    updateTag: vi.fn(),
  },
  ApiError: class extends Error {},
}));

let app: Awaited<ReturnType<typeof mount>>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getCategories).mockResolvedValue([
    {
      id: 1,
      name: '旧分类',
      slug: 'old',
      parentId: null,
      icon: null,
      sortOrder: 0,
      bookmarkCount: 0,
      visibility: 'private',
      effectiveVisibility: 'private',
    },
  ]);
  vi.mocked(api.getTags).mockResolvedValue([
    { id: 1, name: '旧标签', slug: 'old', bookmarkCount: 0 },
  ]);
});
afterEach(async () => app?.cleanup());

const cases = [
  {
    name: '分类',
    Component: CategoriesTab,
    createText: '新建一级分类',
    createLabel: '分类名称',
    renameLabel: '重命名分类',
    create: () => vi.mocked(api.createCategory),
    rename: () => vi.mocked(api.updateCategory),
  },
  {
    name: '标签',
    Component: TagsTab,
    createText: '新建标签',
    createLabel: '新标签名称',
    renameLabel: '重命名标签',
    create: () => vi.mocked(api.createTag),
    rename: () => vi.mocked(api.updateTag),
  },
];

it.each(cases)(
  '$name 新建失败保留草稿，成功后才退出',
  async ({ Component, createText, createLabel, create }) => {
    create()
      .mockRejectedValueOnce(new Error('失败'))
      .mockResolvedValueOnce({} as never);
    app = await mount(<Component />);
    await click(buttonWithText(app.container, createText));
    const input = app.container.querySelector<HTMLInputElement>(`[aria-label="${createLabel}"]`)!;
    await fill(input, '新名称');
    await act(() =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
      ),
    );
    expect(create()).not.toHaveBeenCalled();
    const save = app.container.querySelector<HTMLButtonElement>('[aria-label="确认创建"]')!;
    await click(save);
    expect(input.value).toBe('新名称');
    expect(app.container.textContent).toContain('操作失败，请重试');
    await click(save);
    expect(app.container.querySelector(`[aria-label="${createLabel}"]`)).toBeNull();
  },
);

it.each(cases)(
  '$name 重命名可保存与取消，失败不会丢输入',
  async ({ Component, renameLabel, rename }) => {
    rename()
      .mockRejectedValueOnce(new Error('失败'))
      .mockResolvedValueOnce({} as never);
    app = await mount(<Component />);
    await click(app.container.querySelector<HTMLButtonElement>('[aria-label="重命名"]')!);
    const input = app.container.querySelector<HTMLInputElement>(`[aria-label="${renameLabel}"]`)!;
    await fill(input, '新名称');
    await act(() =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
      ),
    );
    expect(rename()).not.toHaveBeenCalled();
    await click(buttonWithText(app.container, '保存'));
    expect(input.value).toBe('新名称');
    await click(buttonWithText(app.container, '保存'));
    expect(app.container.querySelector(`[aria-label="${renameLabel}"]`)).toBeNull();
    await click(app.container.querySelector<HTMLButtonElement>('[aria-label="重命名"]')!);
    await click(buttonWithText(app.container, '取消'));
    expect(app.container.querySelector(`[aria-label="${renameLabel}"]`)).toBeNull();
    expect(rename()).toHaveBeenCalledTimes(2);
  },
);
