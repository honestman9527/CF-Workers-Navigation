// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LauncherDock } from '@nav/features/launcher/LauncherDock';

import { click, mount } from '../../render';
import { bookmark } from './fixtures';

vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => ({ authed: false }) }));

let app: Awaited<ReturnType<typeof mount>>;
let frameCallback: FrameRequestCallback | undefined;
let media: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  frameCallback = undefined;
  media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(async () => {
  await app?.cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function setup(overrides: Partial<Parameters<typeof LauncherDock>[0]> = {}) {
  const props = {
    bookmarks: [bookmark(), bookmark(2), bookmark(3)],
    hasMore: false,
    loading: false,
    loadingMore: false,
    error: null,
    hidden: false,
    onRetry: vi.fn(),
    onLoadMore: vi.fn(),
    onOpenWorkspace: vi.fn(),
    ...overrides,
  };
  app = await mount(<LauncherDock {...props} />);
  return props;
}
function finishFrame() {
  const callback = frameCallback;
  frameCallback = undefined;
  callback?.(0);
}

it('保留原生新标签链接，图标失败回退首字，键盘聚焦展示完整名称与域名', async () => {
  const title = '很长的网站名称用于完整名称提示';
  await setup({ bookmarks: [bookmark(1, { title, iconUrl: 'https://example1.com/icon.png' })] });
  const link = app.container.querySelector('a')!;
  expect(link.getAttribute('href')).toBe('https://example1.com/path');
  expect(link.target).toBe('_blank');
  expect(link.rel).toContain('noopener');
  expect(link.getAttribute('aria-label')).toBe(`打开 ${title}`);
  await act(() => app.container.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(app.container.querySelector('[data-dock-icon]')?.textContent).toBe('很');
  await act(() => link.focus());
  const tooltip = document.querySelector('[data-slot="tooltip-content"]');
  expect(tooltip?.textContent).toContain(title);
  expect(tooltip?.textContent).toContain('example1.com');
});

it('鼠标邻近渐进放大，离开复位；触屏不触发缩放', async () => {
  await setup();
  const links = [...app.container.querySelectorAll('a')];
  links.forEach((link, index) =>
    vi
      .spyOn(link, 'getBoundingClientRect')
      .mockReturnValue({ left: index * 72, width: 64 } as DOMRect),
  );
  const icons = [...app.container.querySelectorAll<HTMLElement>('[data-dock-icon]')];
  const scroller = links[0].parentElement!;
  const move = new MouseEvent('pointermove', { clientX: 32, bubbles: true });
  Object.defineProperty(move, 'pointerType', { value: 'mouse' });
  await act(() => {
    scroller.dispatchEvent(move);
    finishFrame();
  });
  expect(icons[0].style.transform).toBe('scale(1.5)');
  expect(Number(icons[1].style.transform.slice(6, -1))).toBeGreaterThan(1);
  expect(icons[2].style.transform).toBe('scale(1)');
  await act(() => {
    scroller.dispatchEvent(new Event('pointerleave'));
    finishFrame();
  });
  expect(icons.every((icon) => icon.style.transform === 'scale(1)')).toBe(true);
  const touch = new MouseEvent('pointermove', { clientX: 32, bubbles: true });
  Object.defineProperty(touch, 'pointerType', { value: 'touch' });
  await act(() => {
    scroller.dispatchEvent(touch);
    finishFrame();
  });
  expect(icons.every((icon) => icon.style.transform === 'scale(1)')).toBe(true);
});

it('减少动态偏好变化立即复位缩放，卸载取消帧', async () => {
  await setup();
  const link = app.container.querySelector('a')!;
  vi.spyOn(link, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 64 } as DOMRect);
  await act(() => {
    link.focus();
    finishFrame();
  });
  const icon = app.container.querySelector<HTMLElement>('[data-dock-icon]')!;
  expect(icon.style.transform).toBe('scale(1.5)');
  media.matches = false;
  const change = media.addEventListener.mock.calls.find(([event]) => event === 'change')![1];
  await act(() => {
    change();
    finishFrame();
  });
  expect(icon.style.transform).toBe('scale(1)');
  await act(() => {
    link.blur();
    link.focus();
    finishFrame();
  });
  expect(icon.style.transform).toBe('scale(1)');
});

it('空状态和首批失败提供恢复入口，加载更多失败保留链接并重试', async () => {
  const props = await setup({ hasMore: true, error: '连接失败' });
  expect(app.container.querySelectorAll('a')).toHaveLength(3);
  await click(
    [...app.container.querySelectorAll('button')].find(
      (button) => button.textContent === '重试加载',
    )!,
  );
  expect(props.onLoadMore).toHaveBeenCalledOnce();
  expect(props.onRetry).not.toHaveBeenCalled();
});

it.each([false, true])('首次加载失败或没有公开常用时可恢复（失败：%s）', async (failed) => {
  const props = await setup({ bookmarks: [], error: failed ? '连接失败' : null });
  await click(app.container.querySelector('button')!);
  expect(failed ? props.onRetry : props.onOpenWorkspace).toHaveBeenCalledOnce();
});

it('追加加载期间禁用重复操作，隐藏状态保留链接', async () => {
  await setup({ hasMore: true, loadingMore: true, hidden: true });
  expect(app.container.querySelector('nav')?.hidden).toBe(true);
  expect(app.container.querySelectorAll('a')).toHaveLength(3);
  expect(app.container.querySelector('button')?.disabled).toBe(true);
});
