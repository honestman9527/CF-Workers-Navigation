// @vitest-environment jsdom
import { act, useState } from 'react';
import { expect, it, vi } from 'vitest';

import { SearchSelect } from '@/components/ui/search-select';
import { FrontDialog } from '@nav/features/navigation/FrontDialog';
import { FrontSearchSelect } from '@nav/features/navigation/FrontSearchSelect';

import { click, fill, mount } from '../../render';

const options = [
  { value: '', label: '全部标签' },
  { value: 'react', label: 'React' },
  { value: 'reading', label: '阅读' },
];

it.each([SearchSelect, FrontSearchSelect])(
  '%s 支持搜索、键盘选择、空结果与焦点恢复',
  async (Select) => {
    const onChange = vi.fn();
    function Host() {
      const [value, setValue] = useState('');
      return (
        <Select
          options={options}
          value={value}
          label="按标签筛选"
          placeholder="搜索标签"
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      );
    }
    const app = await mount(<Host />);
    try {
      const trigger = app.container.querySelector('button')!;
      await click(trigger);
      const input = document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
      await fill(input, 'rea');
      expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
      await act(() => {
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      await act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(onChange).toHaveBeenLastCalledWith('react');
      expect(trigger.textContent).toContain('React');
      expect(document.activeElement).toBe(trigger);
      await click(trigger);
      await fill(document.querySelector<HTMLInputElement>('input[role="combobox"]')!, '不存在');
      expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
      expect(document.body.textContent).toContain('没有匹配项');
      await act(() => {
        document
          .querySelector('input')!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
    } finally {
      await app.cleanup();
    }
  },
);

it.each([SearchSelect, FrontSearchSelect])('%s 禁用时不能打开或改变筛选', async (Select) => {
  const onChange = vi.fn();
  const app = await mount(
    <Select
      options={options}
      value=""
      label="标签筛选"
      placeholder="搜索标签"
      onChange={onChange}
      disabled
    />,
  );
  try {
    await click(app.container.querySelector('button')!);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    await app.cleanup();
  }
});

it('前台编辑弹窗内 Escape 先关闭分类浮层，保留编辑器', async () => {
  const onClose = vi.fn();
  const app = await mount(
    <FrontDialog open title="编辑书签" onClose={onClose}>
      <FrontSearchSelect
        options={options}
        value=""
        label="选择分类"
        placeholder="搜索分类"
        onChange={vi.fn()}
      />
    </FrontDialog>,
  );
  try {
    const trigger = document.querySelector<HTMLElement>('[aria-label="选择分类"]')!;
    await click(trigger);
    const input = document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  } finally {
    await app.cleanup();
  }
});
