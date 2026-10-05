// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';

import { useBookmarkMutations } from '@nav/features/bookmarks/useBookmarkMutations';

import { mount } from '../../render';

vi.mock('@nav/components/Toast', () => ({ pushToast: vi.fn() }));

it('同一书签提交期间禁止重复调用，失败后释放并允许重试', async () => {
  const onError = vi.fn();
  let result!: ReturnType<typeof useBookmarkMutations>;
  function Harness() {
    result = useBookmarkMutations({
      refreshPage: vi.fn(),
      reloadTags: vi.fn(),
      reloadCategories: vi.fn(),
      onError,
    });
    return null;
  }
  const app = await mount(<Harness />);
  try {
    let reject!: (error: Error) => void;
    const action = vi.fn().mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    let pending!: Promise<void>;
    await act(() => {
      pending = result.mutate(action, '已加入常用', { bookmarkId: 1, refreshRelated: false });
    });
    expect(result.pendingIds.has(1)).toBe(true);
    await act(async () => result.mutate(action, '已加入常用', { bookmarkId: 1 }));
    expect(action).toHaveBeenCalledOnce();
    await act(async () => {
      reject(new Error('失败'));
      await pending;
    });
    expect(result.pendingIds.has(1)).toBe(false);
    expect(onError).toHaveBeenCalledWith('失败');
    const retry = vi.fn().mockResolvedValue(undefined);
    await act(async () =>
      result.mutate(retry, '已加入常用', { bookmarkId: 1, refreshRelated: false }),
    );
    expect(retry).toHaveBeenCalledOnce();
    expect(result.pendingIds.has(1)).toBe(false);
  } finally {
    await app.cleanup();
  }
});
