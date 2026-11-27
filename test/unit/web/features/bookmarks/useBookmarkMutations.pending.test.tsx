import type { Bookmark } from '@shared/api/types';

// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { useBookmarkMutations } from '@nav/features/bookmarks/useBookmarkMutations';

import { mount } from '../../render';

vi.mock('@nav/api/client', () => ({ api: { copyBookmark: vi.fn() } }));

it('同一书签提交期间禁止重复调用，失败后释放并允许重试', async () => {
  const onError = vi.fn();
  let result!: ReturnType<typeof useBookmarkMutations>;
  function Harness() {
    result = useBookmarkMutations({
      onContentChange: vi.fn(),
      invalidateTags: vi.fn(),
      invalidateCategories: vi.fn(),
      onSuccess: vi.fn(),
      onError,
    });
    return null;
  }
  const app = await mount(<Harness />);
  try {
    let reject!: (error: Error) => void;
    vi.mocked(api.copyBookmark).mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    let pending!: Promise<boolean>;
    await act(() => {
      pending = result.copyToCategory({ id: 1 } as Bookmark, 10);
    });
    expect(result.pendingIds.has(1)).toBe(true);
    await act(async () => {
      expect(await result.copyToCategory({ id: 1 } as Bookmark, 10)).toBe(false);
    });
    expect(api.copyBookmark).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenLastCalledWith('该书签正在处理中，请稍后重试');
    await act(async () => {
      reject(new Error('失败'));
      await pending;
    });
    expect(result.pendingIds.has(1)).toBe(false);
    expect(onError).toHaveBeenCalledWith('失败');
    vi.mocked(api.copyBookmark).mockResolvedValue({ id: 2, categoryId: 10 } as Bookmark);
    await act(async () => {
      expect(await result.copyToCategory({ id: 1 } as Bookmark, 10)).toBe(true);
    });
    expect(api.copyBookmark).toHaveBeenCalledTimes(2);
    expect(result.pendingIds.has(1)).toBe(false);
  } finally {
    await app.cleanup();
  }
});
