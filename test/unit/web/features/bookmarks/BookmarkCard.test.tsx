// @vitest-environment jsdom
import type { Bookmark } from '@shared/api/types';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { pushToast } from '@nav/components/Toast';
import { BookmarkCard } from '@nav/features/bookmarks/BookmarkCard';

import { click, mount } from '../../render';

vi.mock('@nav/components/Toast', () => ({ pushToast: vi.fn() }));

let app: Awaited<ReturnType<typeof mount>>;
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const bookmark: Bookmark = {
  id: 1,
  title: 'Example',
  url: 'https://example.com/path',
  description: null,
  iconUrl: null,
  visibility: 'public',
  effectiveVisibility: 'public',
  tags: [],
  isPinned: false,
  categoryId: null,
  categoryName: null,
  categorySlug: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: '',
  updatedAt: '',
};
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  await app?.cleanup();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

async function setup(readOnly = false, pinPending = false) {
  app = await mount(
    <BookmarkCard
      bookmark={bookmark}
      readOnly={readOnly}
      pinPending={pinPending}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onTogglePin={vi.fn()}
      onArchive={vi.fn()}
    />,
  );
}

it.each([false, true])('复制网址反馈正确（剪贴板拒绝：%s）', async (fail) => {
  const writeText = fail
    ? vi.fn().mockRejectedValue(new Error('拒绝'))
    : vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  await setup();
  await click(app.container.querySelector<HTMLButtonElement>('[aria-label^="更多操作"]')!);
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((node) =>
    node.textContent?.includes('复制网址'),
  )!;
  await click(item);
  expect(writeText).toHaveBeenCalledWith(bookmark.url);
  expect(pushToast).toHaveBeenCalledWith(
    fail ? '复制失败，请右键复制链接地址' : '网址已复制',
    fail ? 'error' : 'success',
  );
});

it('访客保持只读，提交中的常用按钮不可重复操作', async () => {
  await setup(true);
  expect(app.container.querySelector('[aria-label^="更多操作"]')).toBeNull();
  await app.cleanup();
  await setup(false, true);
  expect(app.container.querySelector<HTMLButtonElement>('[aria-label="加入常用"]')?.disabled).toBe(
    true,
  );
});
