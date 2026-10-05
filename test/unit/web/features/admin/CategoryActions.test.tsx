// @vitest-environment jsdom
import type { Category } from '@shared/api/types';

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CategoryActions } from '@nav/features/admin/CategoryActions';

import { click, mount } from '../../render';

const category: Category = {
  id: 1,
  name: '源分类',
  slug: 'source',
  parentId: null,
  icon: null,
  sortOrder: 0,
  bookmarkCount: 0,
  visibility: 'private',
  effectiveVisibility: 'private',
};
const callbacks = {
  onCreate: vi.fn(),
  onRename: vi.fn(),
  onReorder: vi.fn(),
  onPermission: vi.fn(),
  onMove: vi.fn(),
  onDelete: vi.fn(),
};
let app: Awaited<ReturnType<typeof mount>>;
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  await app?.cleanup();
});
async function setup(busy = false) {
  app = await mount(
    <CategoryActions
      category={category}
      categories={[
        category,
        { ...category, id: 2, parentId: 1, name: '后代分类', slug: 'child' },
        { ...category, id: 3, name: '目标分类', slug: 'target' },
      ]}
      excludedIds={new Set([1, 2])}
      busy={busy}
      {...callbacks}
    />,
  );
  return app.container.querySelector<HTMLButtonElement>('[aria-label="源分类 的更多操作"]')!;
}
function item(text: string) {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (node) => node.textContent?.trim() === text,
  )!;
}

it.each([
  { text: '上移', callback: callbacks.onReorder, args: [-1] },
  { text: '下移', callback: callbacks.onReorder, args: [1] },
  { text: '访问权限', callback: callbacks.onPermission, args: [] },
  { text: '删除', callback: callbacks.onDelete, args: [] },
])('更多菜单保留 $text 的处理函数', async ({ text, callback, args }) => {
  const more = await setup();
  expect(app.container.querySelectorAll('button')).toHaveLength(3);
  await click(more);
  expect(
    [...document.querySelectorAll('[role="menuitem"]')].map((node) => node.textContent?.trim()),
  ).toEqual(['上移', '下移', '访问权限', '移动', '删除']);
  await click(item(text));
  expect(callback).toHaveBeenCalledWith(...args);
});

it('移动菜单关闭后独立显示分类树，排除自身及后代，Escape 与选择恢复焦点', async () => {
  const more = await setup();
  await click(more);
  await click(item('移动'));
  const popup = document.querySelector<HTMLElement>('[data-slot="popover-content"]')!;
  expect(popup).not.toBeNull();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(popup.textContent).toContain('可能公开内容');
  expect(popup.textContent).not.toContain('源分类');
  expect(popup.textContent).not.toContain('后代分类');
  await act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  expect(document.activeElement === more).toBe(true);
  await click(more);
  await click(item('移动'));
  const target = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-slot="popover-content"] button'),
  ].find((button) => button.textContent?.includes('目标分类'))!;
  await click(target);
  expect(callbacks.onMove).toHaveBeenCalledWith(3);
  expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  expect(document.activeElement === more).toBe(true);
});

it('请求期间禁用行内入口', async () => {
  await setup(true);
  expect([...app.container.querySelectorAll('button')].every((button) => button.disabled)).toBe(
    true,
  );
});
