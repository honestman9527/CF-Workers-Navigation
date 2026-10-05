// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';

import { CategoryFilter } from '@nav/features/categories/CategoryFilter';

import { click, mount } from '../../render';

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
    const target = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-slot="popover-content"] button'),
    ].find((button) => button.textContent?.includes('工具'))!;
    await click(target);
    expect(onSelect).toHaveBeenLastCalledWith('tools');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement === trigger).toBe(true);
    await click(trigger);
    await click(document.querySelector<HTMLButtonElement>('[data-slot="popover-content"] button')!);
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  } finally {
    await app.cleanup();
  }
});
