// @vitest-environment jsdom
import type { CategoryNode } from '@nav/features/categories/tree';

import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { CategoryNavigation } from '@nav/features/navigation/CategoryNavigation';

import { buttonWithText, click, mount } from '../../render';

let app: Awaited<ReturnType<typeof mount>>;
afterEach(async () => {
  await app?.cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const node = (id: number, name: string, children: CategoryNode[] = []) =>
  ({ id, name, slug: `node-${id}`, children }) as CategoryNode;

it('只展示两行入口，更多展开后可聚焦所有分类，收起和尺寸变化重新收纳', async () => {
  let perRow = 2;
  let resized!: () => void;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(
    function (this: HTMLElement) {
      if (!this.parentElement?.id.startsWith('children-')) return 0;
      return Math.floor([...this.parentElement.children].indexOf(this) / perRow) * 52;
    },
  );
  const root = node(
    1,
    '开发',
    Array.from({ length: 6 }, (_, i) => node(i + 2, `分类${i}`)),
  );
  app = await mount(<CategoryNavigation path={[root]} onSelect={vi.fn()} />);
  const fifth = buttonWithText(app.container, '分类4');
  expect(fifth.tabIndex).toBe(-1);
  expect(fifth.closest('li')?.getAttribute('aria-hidden')).toBe('true');
  expect(buttonWithText(app.container, '更多分类').getAttribute('aria-expanded')).toBe('false');
  await click(buttonWithText(app.container, '更多分类'));
  expect(fifth.tabIndex).toBe(0);
  expect(fifth.closest('li')?.hasAttribute('aria-hidden')).toBe(false);
  await click(buttonWithText(app.container, '收起'));
  expect(fifth.tabIndex).toBe(-1);
  perRow = 3;
  await act(() => resized());
  expect(fifth.tabIndex).toBe(0);
  expect(app.container.textContent).not.toContain('更多分类');
  perRow = 1;
  await act(() => resized());
  expect(buttonWithText(app.container, '分类2').tabIndex).toBe(-1);
});

it('叶子只显示完整可返回路径，长名称保留完整文本和入口提示', async () => {
  const root = node(1, '开发');
  const longName = '用于长名称换行检查的前端框架与开发工具分类';
  const child = node(2, longName);
  const select = vi.fn();
  app = await mount(<CategoryNavigation path={[root, child]} onSelect={select} />);
  expect(app.container.querySelector('ul')).toBeNull();
  expect(app.container.querySelector('[aria-current="page"]')?.textContent).toBe(longName);
  await click(buttonWithText(app.container, '开发'));
  expect(select).toHaveBeenCalledWith('node-1');
});
