// @vitest-environment jsdom
import type { Tag } from '@shared/api/types';

import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { FrontTagFilterBar } from '@nav/features/navigation/FrontTagFilterBar';

import { buttonWithText, click, mount } from '../../render';

let app: Awaited<ReturnType<typeof mount>>;

afterEach(async () => {
  await app?.cleanup();
});

function makeTags(count: number): Tag[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `标签${index + 1}`,
    slug: `tag-${index + 1}`,
    bookmarkCount: index + 1,
  }));
}

it('按热度降序展示最多 12 个快捷标签，隐藏 0 计数标签但保留于下拉并支持已选长尾标签置前', async () => {
  const onChange = vi.fn();
  const tags: Tag[] = [
    ...makeTags(14),
    { id: 99, name: '零使用', slug: 'zero-tag', bookmarkCount: 0 },
  ];

  app = await mount(
    <FrontTagFilterBar
      tags={tags}
      loading={false}
      error={null}
      onRetry={vi.fn()}
      selectedTag="tag-1"
      onChange={onChange}
    />,
  );

  const toolbar = app.container.querySelector('[role="toolbar"][aria-label="快捷标签筛选"]')!;
  const chipButtons = [...toolbar.querySelectorAll('button')];
  const labels = chipButtons.map((btn) => btn.textContent);

  // 「全部」+ 长尾已选 tag-1 + 热门前 12 个（14..3）+ 「无标签」= 15 个
  expect(chipButtons).toHaveLength(15);
  expect(labels[0]).toContain('全部');
  expect(labels[1]).toContain('标签1');
  expect(chipButtons[1]!.getAttribute('aria-pressed')).toBe('true');
  expect(labels[2]).toContain('标签14');
  expect(labels.some((text) => text?.includes('零使用'))).toBe(false);

  // 再次点击当前已激活的标签胶囊会直接取消筛选
  await click(chipButtons[1]!);
  expect(onChange).toHaveBeenLastCalledWith({ tag: undefined, untagged: undefined });

  // 打开可搜索下拉，零使用标签仍在选项中
  await click(app.container.querySelector<HTMLElement>('[aria-label="标签筛选"]')!);
  expect(document.body.textContent).toContain('零使用');
});

it('支持无标签芯片再次点击取消、toolbar roving tabindex 键盘导航与错误重试', async () => {
  const onChange = vi.fn();
  const onRetry = vi.fn();
  const tags: Tag[] = [
    { id: 1, name: 'React', slug: 'react', bookmarkCount: 5 },
    { id: 2, name: 'TypeScript', slug: 'ts', bookmarkCount: 3 },
  ];

  app = await mount(
    <FrontTagFilterBar
      tags={tags}
      loading={false}
      error="标签读取失败"
      onRetry={onRetry}
      untagged
      onChange={onChange}
    />,
  );

  const toolbar = app.container.querySelector('[role="toolbar"]')!;
  const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('button')];
  // untagged=true 时「无标签」紧跟「全部」之后并处于激活状态
  expect(buttons[1]!.textContent).toBe('无标签');
  expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true');
  // 只有当前 tabStop 为 0，其余均为 -1
  expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1]);

  buttons[1]!.focus();
  await act(() => {
    toolbar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  expect(document.activeElement).toBe(buttons[2]);
  expect(buttons.map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1]);

  await act(() => {
    toolbar.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  });
  expect(document.activeElement).toBe(buttons[3]);

  await act(() => {
    toolbar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  });
  expect(document.activeElement).toBe(buttons[0]);

  await click(buttons[1]!);
  expect(onChange).toHaveBeenLastCalledWith({ tag: undefined, untagged: undefined });

  await click(buttonWithText(app.container, '重试标签'));
  expect(onRetry).toHaveBeenCalledOnce();
});
