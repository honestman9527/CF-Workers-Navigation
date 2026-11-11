// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';

import { CategoryFilter } from '@nav/features/categories/CategoryFilter';

import { click, fill, mount } from '../../render';

it('触发按钮可再次收起，外部点击与 Escape 也可关闭', async () => {
  const app = await mount(<CategoryFilter categories={[]} onSelect={vi.fn()} />);
  try {
    const trigger = app.container.querySelector('button')!;
    await click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await click(trigger);
    await click(document.body);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await click(trigger);
    await act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  } finally {
    await app.cleanup();
  }
});

it('选择分类或全部分类后关闭浮层并恢复触发按钮焦点', async () => {
  const onSelect = vi.fn();
  const category = {
    id: 1,
    name: '工具',
    slug: 'tools',
    parentId: null,
    icon: null,
    sortOrder: 0,
    bookmarkCount: 1,
    visibility: 'public' as const,
    effectiveVisibility: 'public' as const,
  };
  const app = await mount(
    <CategoryFilter categories={[category]} selectedSlug="tools" onSelect={onSelect} />,
  );
  try {
    const trigger = app.container.querySelector('button')!;
    await click(trigger);
    const target = [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((button) =>
      button.textContent?.includes('工具'),
    )!;
    await click(target);
    expect(onSelect).toHaveBeenLastCalledWith('tools');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement === trigger).toBe(true);
    await click(trigger);
    await click(document.querySelector<HTMLElement>('[role="treeitem"]')!);
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  } finally {
    await app.cleanup();
  }
});

it('选中二级自动展开父级，显示路径与级别并可按父级搜索', async () => {
  const root = {
    id: 1,
    name: '开发',
    slug: 'dev',
    parentId: null,
    icon: null,
    sortOrder: 0,
    bookmarkCount: 0,
    visibility: 'public' as const,
    effectiveVisibility: 'public' as const,
  };
  const onSelect = vi.fn();
  const app = await mount(
    <CategoryFilter
      categories={[root, { ...root, id: 2, parentId: 1, name: 'React', slug: 'react' }]}
      selectedSlug="react"
      onSelect={onSelect}
    />,
  );
  try {
    const trigger = app.container.querySelector('button')!;
    expect(trigger.textContent).toContain('开发 / React');
    await click(trigger);
    const input = document.querySelector<HTMLInputElement>('input')!;
    await fill(input, '开发 React');
    const options = [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    expect(options).toHaveLength(2);
    expect(options[1].textContent).toContain('开发 / React');
    expect(options[1].textContent).toContain('2 级');
    await click(options[1]);
    expect(onSelect).toHaveBeenLastCalledWith('react');
    expect(document.activeElement).toBe(trigger);
    await click(trigger);
    expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(4);
  } finally {
    await app.cleanup();
  }
});
