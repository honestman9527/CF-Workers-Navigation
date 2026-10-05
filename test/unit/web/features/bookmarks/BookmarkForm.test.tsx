import type { ReactNode } from 'react';

// @vitest-environment jsdom
import type { Bookmark, BookmarkInput } from '@shared/api/types';

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { BookmarkForm } from '@nav/features/bookmarks/BookmarkForm';

import { buttonWithText, click, fill, mount } from '../../render';

vi.mock('@nav/components/DialogPanel', () => ({
  DialogPanel: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@nav/features/categories/CategoryPicker', () => ({ CategoryPicker: () => null }));
vi.mock('@nav/features/visibility/VisibilityField', () => ({
  VisibilityField: () => null,
  useVisibilityDefaults: () => ({ data: { defaultBookmarkVisibility: 'private' }, error: null }),
}));
vi.mock('@nav/api/client', () => ({
  api: { getFavicon: vi.fn(), getMetadata: vi.fn() },
  ApiError: class extends Error {},
}));

let app: Awaited<ReturnType<typeof mount>>;
const bookmark = {
  id: 1,
  title: '手写标题',
  url: 'https://example.com',
  tags: ['React'],
  iconUrl: 'https://example.com/icon.png',
  visibility: 'private',
  effectiveVisibility: 'private',
  categoryId: null,
} as Bookmark;
beforeEach(() => vi.clearAllMocks());
afterEach(async () => app?.cleanup());

async function setup(
  onSubmit = vi.fn<(input: BookmarkInput) => Promise<void>>().mockResolvedValue(),
) {
  app = await mount(
    <BookmarkForm open bookmark={bookmark} onClose={vi.fn()} onSubmit={onSubmit} />,
  );
  return onSubmit;
}

async function submit() {
  await act(() =>
    app.container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

it('直接保存会归并未确认标签，并按已有规则去重', async () => {
  const onSubmit = await setup();
  const input = app.container.querySelector<HTMLInputElement>('#bookmark-tags')!;
  await fill(input, '#工具');
  await submit();
  expect(onSubmit).toHaveBeenLastCalledWith(
    expect.objectContaining({ tags: ['React', '工具'], iconUrl: bookmark.iconUrl }),
  );
  await fill(input, '#react');
  await submit();
  expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['React'] }));
  await fill(input, '工具, react');
  await submit();
  expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['React', '工具'] }));
});

it('保存失败保留标签草稿；输入法确认不提前添加标签', async () => {
  const onSubmit = await setup(vi.fn().mockRejectedValue(new Error('保存失败')));
  const input = app.container.querySelector<HTMLInputElement>('#bookmark-tags')!;
  await fill(input, '工具');
  await act(() =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(input.value).toBe('工具');
  await submit();
  expect(input.value).toBe('工具');
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['React', '工具'] }));
  expect(app.container.textContent).toContain('保存失败');
});

it('图标设置默认折叠，展开后仍保留既有值', async () => {
  await setup();
  const trigger = buttonWithText(app.container, '自定义图标');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  await click(trigger);
  expect(app.container.querySelector<HTMLInputElement>('#bookmark-icon')?.value).toBe(
    bookmark.iconUrl,
  );
  await click(trigger);
  await click(trigger);
  expect(app.container.querySelector<HTMLInputElement>('#bookmark-icon')?.value).toBe(
    bookmark.iconUrl,
  );
});

it('部分网页信息展示补充提示，保留手写标题', async () => {
  vi.mocked(api.getMetadata).mockResolvedValue({
    title: '抓取标题',
    description: '描述',
    iconUrl: '',
    partial: true,
  } as Awaited<ReturnType<typeof api.getMetadata>>);
  await setup();
  await click(buttonWithText(app.container, '自动填写'));
  expect(app.container.textContent).toContain('部分信息未获取到，可手动补充');
  expect(app.container.querySelector<HTMLInputElement>('#bookmark-title')?.value).toBe('手写标题');
});
