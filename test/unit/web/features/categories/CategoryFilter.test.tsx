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
    const target = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((button) =>
      button.textContent?.includes('工具'),
    )!;
    await click(target);
    expect(onSelect).toHaveBeenLastCalledWith('tools');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement === trigger).toBe(true);
    await click(trigger);
    await click(document.querySelector<HTMLElement>('[role="option"]')!);
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  } finally {
    await app.cleanup();
  }
});

it('深层分类直接可见，显示路径与级别，并可按父级搜索', async () => {
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
      categories={[
        root,
        { ...root, id: 2, parentId: 1, name: '前端', slug: 'front' },
        { ...root, id: 3, parentId: 2, name: 'React', slug: 'react' },
      ]}
      selectedSlug="react"
      onSelect={onSelect}
    />,
  );
  try {
    const trigger = app.container.querySelector('button')!;
    expect(trigger.textContent).toContain('开发 / 前端 / React');
    await click(trigger);
    const input = document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await fill(input, '开发 React');
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('开发 / 前端 / React');
    expect(options[0].textContent).toContain('3 级');
    await click(options[0]);
    expect(onSelect).toHaveBeenLastCalledWith('react');
    expect(document.activeElement).toBe(trigger);
    await click(trigger);
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(5);
  } finally {
    await app.cleanup();
  }
});
