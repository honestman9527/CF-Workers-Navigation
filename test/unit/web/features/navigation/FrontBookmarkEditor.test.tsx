import type { ReactNode } from 'react';

// @vitest-environment jsdom
import type { Bookmark, BookmarkInput } from '@shared/api/types';

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { FrontBookmarkEditor } from '@nav/features/navigation/FrontBookmarkEditor';

import { buttonWithText, click, fill, mount } from '../../render';

vi.mock('@nav/features/navigation/FrontDialog', () => ({
  FrontDialog: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@nav/features/categories/CategoryPicker', () => ({ CategoryPicker: () => null }));
vi.mock('@nav/features/visibility/useVisibilityDefaults', () => ({
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
    <FrontBookmarkEditor
      open
      bookmark={bookmark}
      categories={[]}
      tags={[]}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />,
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
  await click(app.container.querySelector<HTMLButtonElement>('[aria-label="自动填写"]')!);
  expect(app.container.textContent).toContain('部分信息未获取到，可手动补充');
  expect(app.container.querySelector<HTMLInputElement>('#bookmark-title')?.value).toBe('手写标题');
});

it('网址变化取消元数据请求，迟到响应不覆盖新网址的编辑内容', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof api.getMetadata>>) => void;
  vi.mocked(api.getMetadata).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await setup();
  await click(app.container.querySelector<HTMLButtonElement>('[aria-label="自动填写"]')!);
  const signal = vi.mocked(api.getMetadata).mock.calls[0][1]!;
  await fill(
    app.container.querySelector<HTMLInputElement>('#bookmark-url')!,
    'https://new.example.com',
  );
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolve({
      url: bookmark.url,
      title: '旧标题',
      description: '旧网页描述',
      iconUrl: '',
      partial: true,
      keywords: [],
      language: '',
      metadata: {
        page_url: bookmark.url,
        canonical_url: bookmark.url,
        keywords: [],
        language: '',
        open_graph: {},
      },
    }),
  );
  expect(app.container.querySelector<HTMLTextAreaElement>('#bookmark-description')!.value).toBe('');
  expect(app.container.textContent).not.toContain('部分信息未获取到');
});

it('卸载编辑器取消图标补全，迟到结果不再发起书签保存', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof api.getFavicon>>) => void;
  vi.mocked(api.getFavicon).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const onSubmit = await setup();
  await click(buttonWithText(app.container, '自定义图标'));
  await fill(app.container.querySelector<HTMLInputElement>('#bookmark-icon')!, '');
  await submit();
  const signal = vi.mocked(api.getFavicon).mock.calls[0][1]!;
  await app.cleanup();
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolve({ url: bookmark.url, iconUrl: 'https://example.com/late.ico', source: 'proxy' }),
  );
  expect(onSubmit).not.toHaveBeenCalled();
});
