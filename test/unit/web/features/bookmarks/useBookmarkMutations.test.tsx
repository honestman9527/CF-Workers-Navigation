// @vitest-environment jsdom
import type { Bookmark, BookmarkInput } from '@shared/api/types';

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { useBookmarkMutations } from '@nav/features/bookmarks/useBookmarkMutations';

import { mount } from '../../render';

vi.mock('@nav/api/client', () => ({
  api: {
    createBookmark: vi.fn(),
    updateBookmark: vi.fn(),
    archiveBookmark: vi.fn(),
    restoreBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
    permanentDeleteBookmark: vi.fn(),
  },
}));

const bookmark = { id: 1, title: '网站', url: 'https://example.com', isPinned: false } as Bookmark;
const input: BookmarkInput = { title: bookmark.title, url: bookmark.url, tags: ['Docs'] };
const effects = {
  onContentChange: vi.fn(),
  reloadTags: vi.fn(),
  reloadCategories: vi.fn(),
  onSuccess: vi.fn(),
  onError: vi.fn(),
};
let current!: ReturnType<typeof useBookmarkMutations>;
let app: Awaited<ReturnType<typeof mount>> | undefined;
function Harness() {
  current = useBookmarkMutations(effects);
  return null;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.createBookmark).mockResolvedValue(bookmark);
  vi.mocked(api.updateBookmark).mockResolvedValue({ ...bookmark, isPinned: true });
  vi.mocked(api.archiveBookmark).mockResolvedValue(bookmark);
  vi.mocked(api.restoreBookmark).mockResolvedValue(bookmark);
});
afterEach(async () => {
  await app?.cleanup();
  app = undefined;
});

it('新增和编辑共用写后刷新规则，向呈现提供已保存记录', async () => {
  app = await mount(<Harness />);
  await act(async () => {
    expect(await current.save(input)).toEqual(bookmark);
  });
  expect(api.createBookmark).toHaveBeenCalledWith('', input);
  expect(effects.onContentChange).toHaveBeenLastCalledWith({ kind: 'created', bookmark });
  await act(async () => {
    await current.save(input, bookmark.id);
  });
  expect(api.updateBookmark).toHaveBeenCalledWith('', bookmark.id, input);
  expect(effects.onSuccess).toHaveBeenLastCalledWith({
    kind: 'updated',
    bookmark: { ...bookmark, isPinned: true },
  });
  expect(effects.reloadTags).toHaveBeenCalledTimes(2);
  expect(effects.reloadCategories).toHaveBeenCalledTimes(2);
});

it('保存失败由编辑器处理，不刷新、不提示成功，随后仍可重试', async () => {
  const failure = new Error('保存失败');
  vi.mocked(api.updateBookmark).mockRejectedValueOnce(failure);
  app = await mount(<Harness />);
  await act(async () => {
    await expect(current.save(input, 1)).rejects.toBe(failure);
  });
  expect(current.pendingIds.size).toBe(0);
  for (const effect of Object.values(effects)) expect(effect).not.toHaveBeenCalled();
  await act(async () => {
    await current.save(input, 1);
  });
  expect(effects.onSuccess).toHaveBeenCalledOnce();
});

it('常用切换提供已保存记录，但不刷新标签或分类', async () => {
  app = await mount(<Harness />);
  await act(async () => {
    await current.togglePin(bookmark);
  });
  expect(api.updateBookmark).toHaveBeenCalledWith('', 1, { isPinned: true });
  expect(effects.onContentChange).toHaveBeenCalledWith({
    kind: 'pinned',
    bookmark: { ...bookmark, isPinned: true },
  });
  expect(effects.reloadTags).not.toHaveBeenCalled();
  expect(effects.reloadCategories).not.toHaveBeenCalled();
});

it.each([
  { state: 'archive', method: 'archiveBookmark', kind: 'archived' },
  { state: 'restore', method: 'restoreBookmark', kind: 'restored' },
  { state: 'trash', method: 'deleteBookmark', kind: 'trashed' },
  { state: 'delete', method: 'permanentDeleteBookmark', kind: 'deleted' },
] as const)('$state 成功后刷新内容及相关索引', async ({ state, method, kind }) => {
  app = await mount(<Harness />);
  await act(async () => {
    await current.changeState(1, state);
  });
  expect(api[method]).toHaveBeenCalledWith('', 1);
  expect(effects.onContentChange).toHaveBeenCalledWith(expect.objectContaining({ kind }));
  expect(effects.reloadTags).toHaveBeenCalledOnce();
  expect(effects.reloadCategories).toHaveBeenCalledOnce();
  expect(effects.onSuccess).toHaveBeenCalledWith(expect.objectContaining({ kind }));
});

it('状态操作失败保留原内容并交由当前呈现反馈', async () => {
  vi.mocked(api.archiveBookmark).mockRejectedValueOnce(new Error('归档失败'));
  app = await mount(<Harness />);
  await act(async () => {
    await current.changeState(1, 'archive');
  });
  expect(effects.onError).toHaveBeenCalledWith('归档失败');
  expect(effects.onContentChange).not.toHaveBeenCalled();
  expect(effects.reloadTags).not.toHaveBeenCalled();
  expect(effects.reloadCategories).not.toHaveBeenCalled();
  expect(effects.onSuccess).not.toHaveBeenCalled();
});

it('卸载后不刷新旧内容，完成反馈仍可由后台共享提示接收', async () => {
  let resolve!: (saved: Bookmark) => void;
  vi.mocked(api.updateBookmark).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  app = await mount(<Harness />);
  let pending!: Promise<void>;
  await act(() => {
    pending = current.togglePin(bookmark);
  });
  await app.cleanup();
  app = undefined;
  await act(async () => {
    resolve({ ...bookmark, isPinned: true });
    await pending;
  });
  expect(effects.onContentChange).not.toHaveBeenCalled();
  expect(effects.reloadTags).not.toHaveBeenCalled();
  expect(effects.onSuccess).toHaveBeenCalledOnce();
});

it('新增提交期间合并重复提交，完成后释放保护', async () => {
  let resolve!: (saved: Bookmark) => void;
  vi.mocked(api.createBookmark).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  app = await mount(<Harness />);
  let pending!: Promise<Bookmark | undefined>;
  await act(() => {
    pending = current.save(input);
  });
  await act(async () => {
    expect(await current.save(input)).toBeUndefined();
  });
  expect(api.createBookmark).toHaveBeenCalledOnce();
  await act(async () => {
    resolve(bookmark);
    await pending;
  });
  await act(async () => {
    await current.save(input);
  });
  expect(api.createBookmark).toHaveBeenCalledTimes(2);
});
