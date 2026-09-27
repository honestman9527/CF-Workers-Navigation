// @vitest-environment jsdom
import type { BookmarkPage } from '@shared/api/types';

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { useLauncherResults } from '@nav/features/launcher/useLauncherResults';

vi.mock('@nav/api/client', () => ({
  api: { searchBookmarks: vi.fn() },
  ApiError: class extends Error {},
}));

let root: Root;
let container: HTMLDivElement;
let query = 'example';
let result: ReturnType<typeof useLauncherResults>;
const onUnauthorized = vi.fn();

function Harness() {
  result = useLauncherResults(query, onUnauthorized);
  return null;
}

async function render() {
  await act(async () => root.render(createElement(Harness)));
}

async function finishDebounce() {
  await act(async () => vi.advanceTimersByTimeAsync(251));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.clearAllMocks();
  query = 'example';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

it('先请求 24 条，用户要求后才读取下一页', async () => {
  vi.mocked(api.searchBookmarks)
    .mockResolvedValueOnce({
      items: Array.from({ length: 24 }, () => ({})),
      nextCursor: 'page-2',
    } as BookmarkPage)
    .mockResolvedValueOnce({ items: [{}], nextCursor: null } as BookmarkPage);
  await render();
  await finishDebounce();
  expect(api.searchBookmarks).toHaveBeenCalledTimes(1);
  expect(api.searchBookmarks).toHaveBeenCalledWith(
    undefined,
    'example',
    { limit: 24 },
    expect.any(AbortSignal),
  );
  expect(result.results).toHaveLength(24);
  expect(result.nextCursor).toBe('page-2');

  await act(async () => result.loadMore());
  expect(api.searchBookmarks).toHaveBeenCalledWith(
    undefined,
    'example',
    { cursor: 'page-2', limit: 24 },
    expect.any(AbortSignal),
  );
  expect(result.results).toHaveLength(25);
  expect(result.nextCursor).toBeNull();
});

it('查询改变后取消旧请求，不让旧结果覆盖新结果', async () => {
  let finishOld!: (page: BookmarkPage) => void;
  vi.mocked(api.searchBookmarks)
    .mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve)))
    .mockResolvedValueOnce({ items: [{}], nextCursor: null } as BookmarkPage);
  await render();
  await finishDebounce();
  query = 'new query';
  await render();
  await finishDebounce();
  await act(async () => finishOld({ items: [{}, {}], nextCursor: null } as BookmarkPage));
  expect(result.results).toHaveLength(1);
  expect(api.searchBookmarks).toHaveBeenCalledTimes(2);
});
