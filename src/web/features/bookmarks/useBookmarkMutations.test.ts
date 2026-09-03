import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pushToast } from '@nav/components/Toast';

import { runBookmarkMutation } from './useBookmarkMutations';

vi.mock('@nav/components/Toast', () => ({
  pushToast: vi.fn(),
}));

describe('runBookmarkMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('刷新书签、标签和分类，并提示成功', async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const refreshPage = vi.fn();
    const reloadTags = vi.fn().mockResolvedValue(undefined);
    const reloadCategories = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    await runBookmarkMutation(
      action,
      { refreshPage, reloadTags, reloadCategories, onError },
      '已归档',
    );

    expect(action).toHaveBeenCalledOnce();
    expect(refreshPage).toHaveBeenCalledOnce();
    expect(reloadTags).toHaveBeenCalledOnce();
    expect(reloadCategories).toHaveBeenCalledOnce();
    expect(pushToast).toHaveBeenCalledWith('已归档', 'success');
    expect(onError).not.toHaveBeenCalled();
  });

  it('失败时报告错误且不刷新或提示成功', async () => {
    const action = vi.fn().mockRejectedValue(new Error('请求失败'));
    const refreshPage = vi.fn();
    const reloadTags = vi.fn();
    const reloadCategories = vi.fn();
    const onError = vi.fn();

    await runBookmarkMutation(
      action,
      { refreshPage, reloadTags, reloadCategories, onError },
      '已移入回收站',
    );

    expect(onError).toHaveBeenCalledWith('请求失败');
    expect(refreshPage).not.toHaveBeenCalled();
    expect(reloadTags).not.toHaveBeenCalled();
    expect(reloadCategories).not.toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
  });
});
