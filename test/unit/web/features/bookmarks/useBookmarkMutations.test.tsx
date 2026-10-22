// @vitest-environment jsdom
import type { Bookmark, BookmarkInput } from '@shared/api/types';

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { useBookmarkEditor } from '@nav/features/bookmarks/useBookmarkEditor';
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

const bookmark: Bookmark = {
  id: 1,
  title: '网站',
  url: 'https://example.com',
  isPinned: false,
  tags: [],
  iconUrl: 'https://example.com/icon.png',
  description: null,
  categoryId: null,
  categorySlug: null,
  categoryName: null,
  visibility: 'public',
  effectiveVisibility: 'public',
  archivedAt: null,
  deletedAt: null,
  createdAt: '2026-10-01 00:00:00',
  updatedAt: '2026-10-01 00:00:00',
};
const input: BookmarkInput = { title: bookmark.title, url: bookmark.url, tags: ['Docs'] };
const effects = {
  onContentChange: vi.fn(),
  invalidateTags: vi.fn(),
  invalidateCategories: vi.fn(),
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
  expect(api.createBookmark).toHaveBeenCalledWith(input);
  expect(effects.onContentChange).toHaveBeenLastCalledWith({ kind: 'created', bookmark });
  await act(async () => {
    await current.save(input, bookmark.id);
  });
  expect(api.updateBookmark).toHaveBeenCalledWith(bookmark.id, input);
  expect(effects.onSuccess).toHaveBeenLastCalledWith({
    kind: 'updated',
    bookmark: { ...bookmark, isPinned: true },
  });
  expect(effects.invalidateTags).toHaveBeenCalledTimes(2);
  expect(effects.invalidateCategories).toHaveBeenCalledTimes(2);
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

it('索引失效通知不延长写入锁，也不推迟保存成功反馈', async () => {
  let finish!: () => void;
  effects.invalidateTags.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  app = await mount(<Harness />);
  await act(async () => {
    expect(await current.save(input)).toEqual(bookmark);
  });
  expect(effects.onSuccess).toHaveBeenCalledOnce();
  await act(async () => {
    await current.save(input);
  });
  expect(api.createBookmark).toHaveBeenCalledTimes(2);
  finish();
});

it('常用切换提供已保存记录，但不刷新标签或分类', async () => {
  app = await mount(<Harness />);
  await act(async () => {
    await current.togglePin(bookmark);
  });
  expect(api.updateBookmark).toHaveBeenCalledWith(1, { isPinned: true });
  expect(effects.onContentChange).toHaveBeenCalledWith({
    kind: 'pinned',
    bookmark: { ...bookmark, isPinned: true },
  });
  expect(effects.invalidateTags).not.toHaveBeenCalled();
  expect(effects.invalidateCategories).not.toHaveBeenCalled();
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
  expect(api[method]).toHaveBeenCalledWith(1);
  expect(effects.onContentChange).toHaveBeenCalledWith(expect.objectContaining({ kind }));
  expect(effects.invalidateTags).toHaveBeenCalledOnce();
  expect(effects.invalidateCategories).toHaveBeenCalledOnce();
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
  expect(effects.invalidateTags).not.toHaveBeenCalled();
  expect(effects.invalidateCategories).not.toHaveBeenCalled();
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
  expect(effects.invalidateTags).not.toHaveBeenCalled();
  expect(effects.onSuccess).toHaveBeenCalledOnce();
});

it('新增提交期间明确拒绝重复提交，完成后释放保护', async () => {
  let resolve!: (saved: Bookmark) => void;
  vi.mocked(api.createBookmark).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  app = await mount(<Harness />);
  let pending!: Promise<Bookmark>;
  await act(() => {
    pending = current.save(input);
  });
  await act(async () => {
    await expect(current.save(input)).rejects.toThrow('正在处理');
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

it('常用请求期间保存显示冲突并保留草稿，完成后可重新保存', async () => {
  let editor!: ReturnType<typeof useBookmarkEditor>;
  function EditorHarness() {
    current = useBookmarkMutations(effects);
    editor = useBookmarkEditor({
      open: true,
      bookmark,
      onSubmit: async (value) => {
        await current.save(value, bookmark.id);
      },
    });
    return null;
  }
  let resolve!: (saved: Bookmark) => void;
  vi.mocked(api.updateBookmark).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  app = await mount(<EditorHarness />);
  let pin!: Promise<void>;
  await act(() => {
    editor.setForm((previous) => ({ ...previous, title: '修改后的标题' }));
    editor.setTagDraft('工具');
    pin = current.togglePin(bookmark);
  });
  try {
    await act(async () => {
      await editor.submit();
    });
    expect(editor.error).toContain('正在处理');
    expect(editor.form.title).toBe('修改后的标题');
    expect(editor.tagDraft).toBe('工具');
    expect(editor.loading).toBe(false);
    expect(current.pendingIds.has(1)).toBe(true);
    expect(api.updateBookmark).toHaveBeenCalledOnce();
    expect(effects.onSuccess).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      resolve({ ...bookmark, isPinned: true });
      await pin;
    });
  }
  await act(async () => {
    await editor.submit();
  });
  expect(api.updateBookmark).toHaveBeenLastCalledWith(
    1,
    expect.objectContaining({
      title: '修改后的标题',
      tags: ['工具'],
    }),
  );
  expect(editor.error).toBeNull();
  expect(effects.onSuccess).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'updated' }));
});

it.each([
  { state: 'archive', method: 'archiveBookmark' },
  { state: 'restore', method: 'restoreBookmark' },
  { state: 'trash', method: 'deleteBookmark' },
  { state: 'delete', method: 'permanentDeleteBookmark' },
] as const)('常用请求期间 $state 明确反馈冲突，完成后仍可执行', async ({ state, method }) => {
  let resolve!: (saved: Bookmark) => void;
  vi.mocked(api.updateBookmark).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  app = await mount(<Harness />);
  let pin!: Promise<void>;
  await act(() => {
    pin = current.togglePin(bookmark);
  });
  try {
    await act(async () => {
      await current.changeState(1, state);
    });
    expect(api[method]).not.toHaveBeenCalled();
    expect(effects.onError).toHaveBeenCalledWith(expect.stringContaining('正在处理'));
    expect(effects.onSuccess).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      resolve({ ...bookmark, isPinned: true });
      await pin;
    });
  }
  await act(async () => {
    await current.changeState(1, state);
  });
  expect(api[method]).toHaveBeenCalledOnce();
});

it('不同书签仍可同时写入', async () => {
  let resolve!: (saved: Bookmark) => void;
  vi.mocked(api.updateBookmark).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  app = await mount(<Harness />);
  let pin!: Promise<void>;
  await act(() => {
    pin = current.togglePin(bookmark);
  });
  try {
    await act(async () => {
      await current.save(input, 2);
    });
    expect(api.updateBookmark).toHaveBeenCalledWith(2, input);
    expect(effects.onError).not.toHaveBeenCalled();
    expect(current.pendingIds.has(1)).toBe(true);
  } finally {
    await act(async () => {
      resolve({ ...bookmark, isPinned: true });
      await pin;
    });
  }
});
