// @vitest-environment jsdom
import type { Bookmark, BookmarkPage } from '@shared/api/types';

import { act, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { useBookmarkFeed } from '@nav/features/navigation/useBookmarkFeed';

import { click, mount } from '../../render';

vi.mock('@nav/api/client', () => ({
  api: { getBookmarks: vi.fn(), searchBookmarks: vi.fn() },
  ApiError: class extends Error {},
}));
let app: Awaited<ReturnType<typeof mount>>;
const bookmark = (id: number) => ({ id, title: `网站${id}` }) as Bookmark;
beforeEach(() => vi.clearAllMocks());
afterEach(async () => app?.cleanup());

function Probe() {
  const [category, setCategory] = useState('one');
  const feed = useBookmarkFeed({ category, onUnauthorized: vi.fn() });
  return (
    <>
      <button onClick={() => void feed.loadMore()}>更多</button>
      <button onClick={feed.retry}>重试</button>
      <button onClick={() => setCategory('two')}>切换</button>
      <output>
        {feed.items.map((item) => item.title).join(',')}
        {feed.error}
      </output>
    </>
  );
}

it('首批12条，追加24条；追加失败保留内容并重试相同游标', async () => {
  vi.mocked(api.getBookmarks)
    .mockResolvedValueOnce({ items: [bookmark(1)], nextCursor: 'next' })
    .mockRejectedValueOnce(new Error('断网'))
    .mockResolvedValueOnce({ items: [bookmark(1), bookmark(2)], nextCursor: null });
  app = await mount(<Probe />);
  expect(api.getBookmarks).toHaveBeenNthCalledWith(
    1,
    undefined,
    expect.objectContaining({ category: 'one', limit: 12 }),
    expect.any(AbortSignal),
  );
  await click(app.container.querySelector('button')!);
  expect(app.container.textContent).toContain('网站1断网');
  await click(app.container.querySelectorAll('button')[1]);
  expect(api.getBookmarks).toHaveBeenNthCalledWith(
    3,
    undefined,
    expect.objectContaining({ cursor: 'next', limit: 24 }),
    expect.any(AbortSignal),
  );
  expect(app.container.querySelector('output')!.textContent).toBe('网站1,网站2');
});

it('切换筛选立即清空旧数据，取消请求并忽略迟到响应', async () => {
  let finish!: (value: BookmarkPage) => void;
  vi.mocked(api.getBookmarks)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ items: [bookmark(2)], nextCursor: null });
  app = await mount(<Probe />);
  const signal = vi.mocked(api.getBookmarks).mock.calls[0][2]!;
  await click(app.container.querySelectorAll('button')[2]);
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ items: [bookmark(1)], nextCursor: 'old' }));
  expect(app.container.querySelector('output')!.textContent).toBe('网站2');
});
