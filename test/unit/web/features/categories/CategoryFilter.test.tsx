// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';

import { CategoryFilter } from '@nav/features/categories/CategoryFilter';

import { click, mount } from '../../render';

vi.mock('@nav/features/categories/CategoryTree', () => ({ CategoryTree: () => null }));

it('触发按钮可再次收起，外部点击与 Escape 也可关闭', async () => {
  const app = await mount(<CategoryFilter categories={[]} onSelect={vi.fn()} />);
  try {
    const trigger = app.container.querySelector('button')!;
    await click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await click(trigger);
    await act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
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
