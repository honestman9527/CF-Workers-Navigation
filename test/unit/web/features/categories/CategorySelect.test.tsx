// @vitest-environment jsdom
import { act, useState } from 'react';
import { expect, it, vi } from 'vitest';

import { CategorySelect } from '@/components/ui/category-select';
import { FrontCategorySelect } from '@nav/features/navigation/FrontCategorySelect';
import { FrontDialog } from '@nav/features/navigation/FrontDialog';

import { click, fill, mount } from '../../render';

const options = [
  { value: '', label: '未分类' },
  { value: 'cloud', label: '云服务', depth: 0 },
  {
    value: 'storage',
    label: '云存储',
    depth: 1,
    parentValue: 'cloud',
    path: '云服务 / 云存储',
    private: true,
  },
  { value: 'server', label: '云服务器', depth: 1, parentValue: 'cloud', path: '云服务 / 云服务器' },
  { value: 'dev', label: '开发', depth: 0 },
];
async function key(target: Element, key: string) {
  await act(() =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })),
  );
}
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')];

it.each([CategorySelect, FrontCategorySelect])(
  '分类树折叠与选择分离，搜索显示父级并恢复原折叠状态',
  async (Select) => {
    const onChange = vi.fn();
    function Host() {
      const [value, setValue] = useState('');
      return (
        <Select
          options={options}
          value={value}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
          label="选择分类"
          placeholder="搜索分类"
        />
      );
    }
    const app = await mount(<Host />);
    try {
      const trigger = app.container.querySelector('button')!;
      await click(trigger);
      expect(rows()).toHaveLength(3);
      await click(document.querySelector<HTMLElement>('[aria-label="展开 云服务"]')!);
      expect(onChange).not.toHaveBeenCalled();
      expect(rows()).toHaveLength(5);
      await click(document.querySelector<HTMLElement>('[aria-label="收起 云服务"]')!);
      const input = document.querySelector<HTMLInputElement>('input')!;
      await fill(input, '云服务 存储');
      expect(rows()).toHaveLength(2);
      expect(rows()[0].getAttribute('aria-expanded')).toBe('true');
      expect(rows()[1].textContent).toContain('云服务 / 云存储');
      expect(rows()[1].querySelector('[aria-label="仅登录可见"]')).not.toBeNull();
      await fill(input, '');
      expect(rows()).toHaveLength(3);
      await fill(input, '存储');
      await key(input, 'ArrowDown');
      await key(document.activeElement!, 'ArrowDown');
      await key(document.activeElement!, 'Enter');
      expect(onChange).toHaveBeenLastCalledWith('storage');
      expect(document.activeElement).toBe(trigger);
      expect(trigger.textContent).toContain('云服务 / 云存储');
      await click(trigger);
      expect(rows()).toHaveLength(5);
      expect(document.querySelector<HTMLInputElement>('input')?.value).toBe('');
      expect(
        rows().find((row) => row.getAttribute('aria-selected') === 'true')?.textContent,
      ).toContain('云存储');
    } finally {
      await app.cleanup();
    }
  },
);

it.each([CategorySelect, FrontCategorySelect])(
  '分类树支持树键盘、空结果、Escape及禁用',
  async (Select) => {
    const onChange = vi.fn();
    let disable!: () => void;
    function Host() {
      const [disabled, setDisabled] = useState(false);
      disable = () => setDisabled(true);
      return (
        <Select
          options={options}
          value=""
          onChange={onChange}
          label="选择分类"
          placeholder="搜索分类"
          disabled={disabled}
        />
      );
    }
    const app = await mount(<Host />);
    try {
      const trigger = app.container.querySelector('button')!;
      await click(trigger);
      const input = document.querySelector<HTMLInputElement>('input')!;
      await key(input, 'ArrowDown');
      await key(document.activeElement!, 'ArrowDown');
      await key(document.activeElement!, 'ArrowRight');
      expect(rows()).toHaveLength(5);
      await key(document.activeElement!, 'ArrowRight');
      expect(document.activeElement?.textContent).toContain('云存储');
      await key(document.activeElement!, 'ArrowLeft');
      await key(document.activeElement!, 'ArrowLeft');
      expect(rows()).toHaveLength(3);
      await key(document.activeElement!, 'End');
      expect(document.activeElement?.textContent).toContain('开发');
      await key(document.activeElement!, 'Home');
      expect(document.activeElement?.textContent).toContain('未分类');
      await fill(input, '不存在');
      expect(rows()).toHaveLength(0);
      expect(document.body.textContent).toContain('没有匹配项');
      await key(input, 'Escape');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
      await act(() => disable());
      await click(app.container.querySelector('button')!);
      expect(document.querySelector('[role="tree"]')).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      await app.cleanup();
    }
  },
);

it('前台弹窗内 Escape 仅关闭分类树并恢复焦点', async () => {
  const onClose = vi.fn();
  const app = await mount(
    <FrontDialog open title="编辑书签" onClose={onClose}>
      <FrontCategorySelect
        options={options}
        value="storage"
        label="选择分类"
        placeholder="搜索分类"
        onChange={vi.fn()}
      />
    </FrontDialog>,
  );
  try {
    const trigger = document.querySelector<HTMLElement>('button[aria-label="选择分类"]')!;
    await click(trigger);
    await key(document.querySelector('input')!, 'Escape');
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector('[role="tree"]')).toBeNull();
  } finally {
    await app.cleanup();
  }
});
