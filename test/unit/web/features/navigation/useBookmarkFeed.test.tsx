// @vitest-environment jsdom
import type { Bookmark, BookmarkPage } from '@shared/api/types';

import { act, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import {
  createBookmarkFeedCache,
  type BookmarkFeedCache,
} from '@nav/features/navigation/bookmarkFeedCache';
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

function Probe({ coordinator }: { coordinator?: BookmarkFeedCache }) {
  const [category, setCategory] = useState('one');
  const [version, setVersion] = useState(0);
  const feed = useBookmarkFeed({
    category,
    cacheVisited: true,
    version,
    coordinator,
    onUnauthorized: vi.fn(),
  });
  return (
    <>
      <button onClick={() => void feed.loadMore()}>更多</button>
      <button onClick={feed.retry}>重试</button>
      <button onClick={() => setCategory('two')}>切换</button>
      <button onClick={() => setCategory('one')}>返回</button>
      <button onClick={() => setVersion((value) => value + 1)}>刷新</button>
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
    expect.objectContaining({ category: 'one', limit: 12 }),
    expect.any(AbortSignal),
  );
  await click(app.container.querySelector('button')!);
  expect(app.container.textContent).toContain('网站1断网');
  await click(app.container.querySelectorAll('button')[1]);
  expect(api.getBookmarks).toHaveBeenNthCalledWith(
    3,
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
  const signal = vi.mocked(api.getBookmarks).mock.calls[0][1]!;
  await click(app.container.querySelectorAll('button')[2]);
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ items: [bookmark(1)], nextCursor: 'old' }));
  expect(app.container.querySelector('output')!.textContent).toBe('网站2');
});

it('返回已访问分类恢复追加项和错误，重试继续原游标；版本更新使旧缓存失效', async () => {
  vi.mocked(api.getBookmarks)
    .mockResolvedValueOnce({ items: [bookmark(1)], nextCursor: 'page2' })
    .mockResolvedValueOnce({ items: [bookmark(2)], nextCursor: 'page3' })
    .mockRejectedValueOnce(new Error('追加失败'))
    .mockResolvedValueOnce({ items: [bookmark(20)], nextCursor: null })
    .mockResolvedValueOnce({ items: [bookmark(3)], nextCursor: null })
    .mockResolvedValueOnce({ items: [bookmark(10)], nextCursor: null })
    .mockResolvedValueOnce({ items: [bookmark(30)], nextCursor: null });
  app = await mount(<Probe />);
  const buttons = app.container.querySelectorAll('button');
  await click(buttons[0]);
  await click(buttons[0]);
  expect(app.container.querySelector('output')?.textContent).toBe('网站1,网站2追加失败');
  await click(buttons[2]);
  const count = vi.mocked(api.getBookmarks).mock.calls.length;
  await click(buttons[3]);
  expect(api.getBookmarks).toHaveBeenCalledTimes(count);
  expect(app.container.querySelector('output')?.textContent).toBe('网站1,网站2追加失败');
  await click(buttons[1]);
  expect(api.getBookmarks).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: 'page3', limit: 24 }),
    expect.any(AbortSignal),
  );
  expect(app.container.querySelector('output')?.textContent).toBe('网站1,网站2,网站3');
  await click(buttons[4]);
  expect(app.container.querySelector('output')?.textContent).toBe('网站10');
  await click(buttons[2]);
  expect(app.container.querySelector('output')?.textContent).toBe('网站30');
});

it('取消未完成的追加后返回原分类保留内容和游标，迟到响应不污染缓存', async () => {
  let finish!: (value: BookmarkPage) => void;
  vi.mocked(api.getBookmarks)
    .mockResolvedValueOnce({ items: [bookmark(1)], nextCursor: 'next' })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ items: [bookmark(20)], nextCursor: null })
    .mockResolvedValueOnce({ items: [bookmark(2)], nextCursor: null });
  app = await mount(<Probe />);
  const buttons = app.container.querySelectorAll('button');
  await click(buttons[0]);
  const signal = vi.mocked(api.getBookmarks).mock.calls[1][1]!;
  await click(buttons[2]);
  expect(signal.aborted).toBe(true);
  await act(() => finish({ items: [bookmark(99)], nextCursor: 'bad' }));
  await click(buttons[3]);
  expect(app.container.querySelector('output')?.textContent).toBe('网站1');
  await click(buttons[0]);
  expect(api.getBookmarks).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: 'next' }),
    expect.any(AbortSignal),
  );
  expect(app.container.querySelector('output')?.textContent).toBe('网站1,网站2');
});

it('缓存首次加载错误后仍可原地重试', async () => {
  vi.mocked(api.getBookmarks)
    .mockRejectedValueOnce(new Error('首次失败'))
    .mockResolvedValueOnce({ items: [bookmark(1)], nextCursor: null });
  app = await mount(<Probe />);
  expect(app.container.textContent).toContain('首次失败');
  await click(app.container.querySelectorAll('button')[1]);
  expect(app.container.querySelector('output')?.textContent).toBe('网站1');
});

it('提交期间的旧读取采用已提交变更，之后的新读取接管数据', async () => {
  const coordinator = createBookmarkFeedCache();
  let finish!: (value: BookmarkPage) => void;
  vi.mocked(api.getBookmarks)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ items: [{ ...bookmark(1), title: '服务端新值' }], nextCursor: null });
  app = await mount(<Probe coordinator={coordinator} />);
  await act(() => coordinator.apply({ ...bookmark(1), title: '本次已提交' }));
  await act(() => finish({ items: [bookmark(1)], nextCursor: null }));
  expect(app.container.querySelector('output')?.textContent).toBe('本次已提交');
  await click(app.container.querySelectorAll('button')[4]);
  expect(app.container.querySelector('output')?.textContent).toBe('服务端新值');
});

it('变更同步到已访问分类，追加中的迟到数据不撤销变更', async () => {
  const coordinator = createBookmarkFeedCache();
  let finish!: (value: BookmarkPage) => void;
  vi.mocked(api.getBookmarks)
    .mockResolvedValueOnce({ items: [bookmark(1)], nextCursor: 'next' })
    .mockResolvedValueOnce({ items: [bookmark(20)], nextCursor: null })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  app = await mount(<Probe coordinator={coordinator} />);
  const buttons = app.container.querySelectorAll('button');
  await click(buttons[2]);
  await act(() => coordinator.apply({ ...bookmark(1), title: '已缓存变更' }));
  await click(buttons[3]);
  expect(app.container.querySelector('output')?.textContent).toBe('已缓存变更');
  await click(buttons[0]);
  await act(() => {
    coordinator.apply({ ...bookmark(1), title: '最新首条' });
    coordinator.apply({ ...bookmark(2), title: '最新追加条目' });
    finish({ items: [bookmark(2)], nextCursor: null });
  });
  expect(app.container.querySelector('output')?.textContent).toBe('最新首条,最新追加条目');
});
