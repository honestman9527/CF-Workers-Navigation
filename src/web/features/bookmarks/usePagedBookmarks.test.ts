// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';

import { usePagedBookmarks } from './usePagedBookmarks';

vi.mock('@nav/api/client', () => ({
  api: { getBookmarks: vi.fn(), searchBookmarks: vi.fn() },
  ApiError: class extends Error {},
}));
let root: Root;
let container: HTMLDivElement;
let result: ReturnType<typeof usePagedBookmarks>;
let props: Parameters<typeof usePagedBookmarks>[0];
function Harness() {
  result = usePagedBookmarks(props);
  return null;
}
async function render() {
  await act(async () => root.render(createElement(Harness)));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  props = {
    view: 'active',
    pinned: false,
    query: '',
    pageSize: 24,
    page: 1,
    onPageChange: vi.fn(),
    onError: vi.fn(),
    onUnauthorized: vi.fn(),
  };
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});
it('请求无标签分页与总数，支持搜索分页', async () => {
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [], total: 72, nextCursor: null });
  props = { ...props, untagged: true, page: 2 };
  await render();
  expect(api.getBookmarks).toHaveBeenCalledWith(
    undefined,
    expect.objectContaining({ view: 'active', untagged: true, offset: 24, limit: 24 }),
    expect.any(AbortSignal),
  );
  expect(result.total).toBe(72);
  vi.mocked(api.searchBookmarks).mockResolvedValue({ items: [], total: 0, nextCursor: null });
  props = { ...props, page: 1, query: 'hello', untagged: undefined };
  await render();
  expect(api.searchBookmarks).toHaveBeenCalledWith(
    undefined,
    'hello',
    expect.objectContaining({ offset: 0, limit: 24 }),
    expect.any(AbortSignal),
  );
});
it('末页越界收敛，空库回第一页', async () => {
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [], total: 25, nextCursor: null });
  props = { ...props, page: 3 };
  await render();
  expect(props.onPageChange).toHaveBeenCalledWith(2);
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [], total: 0, nextCursor: null });
  await act(() => result.refresh());
  expect(props.onPageChange).toHaveBeenCalledWith(1);
});
it('取消的旧响应不会覆盖新页', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof api.getBookmarks>>) => void;
  vi.mocked(api.getBookmarks).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render();
  const signal = vi.mocked(api.getBookmarks).mock.calls[0][2];
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [], total: 2, nextCursor: null });
  props = { ...props, tag: 'new' };
  await render();
  expect(signal?.aborted).toBe(true);
  await act(async () => resolve({ items: [], total: 999, nextCursor: null }));
  expect(result.total).toBe(2);
});
it('请求失败提供错误状态，重试成功清除错误', async () => {
  vi.mocked(api.getBookmarks).mockRejectedValue(new Error('网络中断'));
  await render();
  expect(result.error).toBe('网络中断');
  expect(result.loading).toBe(false);
  vi.mocked(api.getBookmarks).mockResolvedValue({ items: [], total: 0, nextCursor: null });
  await act(() => result.refresh());
  expect(result.error).toBeNull();
});
