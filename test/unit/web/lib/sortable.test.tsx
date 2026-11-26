// @vitest-environment jsdom
import { act, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useSortableList, type SortableLayout } from '@/lib/sortable';

import { click, mount } from '../render';

type DemoItem = { id: number; name: string };

function mockRect(el: HTMLElement, rect: Partial<DOMRect>) {
  const full = {
    left: 0,
    top: 0,
    right: rect.width ?? 100,
    bottom: rect.height ?? 40,
    width: rect.width ?? 100,
    height: rect.height ?? 40,
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  el.getBoundingClientRect = () => full;
}

function SortableHarness({
  layout = 'vertical',
  onCommit,
}: {
  layout?: SortableLayout;
  onCommit: (ids: number[], meta: { commit: boolean }) => void;
}) {
  const [items, setItems] = useState<DemoItem[]>([
    { id: 1, name: '一' },
    { id: 2, name: '二' },
    { id: 3, name: '三' },
  ]);

  const sortable = useSortableList({
    items,
    enabled: true,
    layout,
    getLabel: (item) => item.name,
    onChangeOrder: (nextIds, meta) => {
      setItems((prev) => nextIds.map((id) => prev.find((item) => item.id === id)!));
      onCommit(nextIds, meta);
    },
  });

  return (
    <div ref={sortable.setMarkerRef} className="relative">
      <p role="status" className="sr-only">
        {sortable.announcement}
      </p>
      <ol ref={sortable.setListRef} onFocus={sortable.onListFocus}>
        {items.map((item, index) => (
          <li key={item.id} {...sortable.getItemProps(item.id)}>
            <button type="button" {...sortable.getHandleProps(item, index)} className="drag-handle">
              手柄 {item.name}
            </button>
            <button
              type="button"
              ref={sortable.registerMoveButton(item.id, -1)}
              disabled={index === 0}
              onClick={() => sortable.moveBy(item.id, -1)}
            >
              上移 {item.name}
            </button>
            <button
              type="button"
              ref={sortable.registerMoveButton(item.id, 1)}
              disabled={index === items.length - 1}
              onClick={() => sortable.moveBy(item.id, 1)}
            >
              下移 {item.name}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

let app: Awaited<ReturnType<typeof mount>>;

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(async () => {
  await app?.cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('支持指针拖拽排序并放置指示器定位，放回原槽位不触发提交，Esc 取消恢复', async () => {
  const onCommit = vi.fn();
  app = await mount(<SortableHarness onCommit={onCommit} />);
  const marker = app.container.firstElementChild as HTMLElement;
  const list = app.container.querySelector('ol') as HTMLElement;
  const rows = [...app.container.querySelectorAll('li')];

  mockRect(marker, { left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150 });
  mockRect(list, { left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150 });
  mockRect(rows[0], { left: 0, top: 0, width: 300, height: 40, right: 300, bottom: 40 });
  mockRect(rows[1], { left: 0, top: 50, width: 300, height: 40, right: 300, bottom: 90 });
  mockRect(rows[2], { left: 0, top: 100, width: 300, height: 40, right: 300, bottom: 140 });

  const handle1 = rows[0].querySelector<HTMLButtonElement>('.drag-handle')!;

  // 拖拽第一行到最后一行下方后松手 -> 应提交 [2, 3, 1]
  await act(() => {
    handle1.dispatchEvent(
      new MouseEvent('pointerdown', { button: 0, clientX: 20, clientY: 20, bubbles: true }),
    );
    document.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 20, clientY: 135, bubbles: true }),
    );
  });
  expect(document.documentElement.classList.contains('drag-reordering')).toBe(true);
  expect(marker.dataset.drop).toBe('horizontal');

  await act(() => {
    document.dispatchEvent(
      new MouseEvent('pointerup', { clientX: 20, clientY: 135, bubbles: true }),
    );
  });
  expect(document.documentElement.classList.contains('drag-reordering')).toBe(false);
  expect(marker.dataset.drop).toBeUndefined();
  expect(onCommit).toHaveBeenLastCalledWith([2, 3, 1], { commit: true });

  // 拖拽后按 Escape 取消不提交新顺序
  const currentFirst = app.container.querySelector('li .drag-handle') as HTMLButtonElement;
  await act(() => {
    currentFirst.dispatchEvent(
      new MouseEvent('pointerdown', { button: 0, clientX: 20, clientY: 20, bubbles: true }),
    );
    document.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 20, clientY: 135, bubbles: true }),
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(onCommit).toHaveBeenCalledTimes(1);
});

it('支持键盘 Space 拾取-方向键移动-Space 放置与 Esc 取消，以及边界按钮焦点接管', async () => {
  const onCommit = vi.fn();
  app = await mount(<SortableHarness onCommit={onCommit} />);
  const rows = [...app.container.querySelectorAll('li')];
  const handle1 = rows[0].querySelector<HTMLButtonElement>('.drag-handle')!;

  // Space 拾取 -> ArrowDown -> Space 放置
  await act(() => {
    handle1.focus();
    handle1.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  });
  expect(handle1.getAttribute('aria-pressed')).toBe('true');
  await act(() => {
    handle1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  expect(onCommit).toHaveBeenLastCalledWith([2, 1, 3], { commit: false });
  await act(() => {
    handle1.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  });
  expect(handle1.getAttribute('aria-pressed')).toBe('false');
  expect(onCommit).toHaveBeenLastCalledWith([2, 1, 3], { commit: true });

  // Space 拾取 -> ArrowDown -> Esc 取消恢复
  await act(() => {
    handle1.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    handle1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    handle1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(onCommit).toHaveBeenLastCalledWith([2, 1, 3], { commit: false });

  // 边界移动按钮焦点接管：第二项（第 0 位）再上移不可，第 1 位（"一"）上移到第 0 位后焦点转到"下移 一"
  const upBtn = [...app.container.querySelectorAll<HTMLButtonElement>('button')].find(
    (btn) => btn.textContent === '上移 一',
  )!;
  const downBtn = [...app.container.querySelectorAll<HTMLButtonElement>('button')].find(
    (btn) => btn.textContent === '下移 一',
  )!;
  upBtn.focus();
  await click(upBtn);
  expect(upBtn.disabled).toBe(true);
  expect(document.activeElement).toBe(downBtn);

  // 单一 role="status" 在 500ms 防抖后播报
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(app.container.querySelector('[role="status"]')?.textContent).toContain('第 1 / 3 位');
});
