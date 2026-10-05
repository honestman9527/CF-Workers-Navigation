// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LauncherClock } from '@nav/features/launcher/LauncherClock';

import { mount } from '../../render';

let app: Awaited<ReturnType<typeof mount>> | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(async () => {
  await app?.cleanup();
  app = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('使用本地 24 小时时间，准确对齐分钟边界并同步问候', async () => {
  vi.setSystemTime(new Date(2026, 9, 5, 11, 59, 58, 250));
  app = await mount(<LauncherClock />);
  expect(app.container.querySelector('time')?.textContent).toBe('11:59');
  expect(app.container.textContent).toContain('早上好');
  await act(() => vi.advanceTimersByTime(1749));
  expect(app.container.querySelector('time')?.textContent).toBe('11:59');
  await act(() => vi.advanceTimersByTime(1));
  expect(app.container.querySelector('time')?.textContent).toBe('12:00');
  expect(app.container.textContent).toContain('下午好');
});

it('跨午夜更新日期、星期和问候，零点显示 00', async () => {
  vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 59));
  app = await mount(<LauncherClock />);
  expect(app.container.textContent).toContain('10月5日');
  expect(app.container.textContent).toContain('星期一');
  await act(() => vi.advanceTimersByTime(1000));
  expect(app.container.querySelector('time')?.textContent).toBe('00:00');
  expect(app.container.textContent).toContain('10月6日');
  expect(app.container.textContent).toContain('星期二');
  expect(app.container.textContent).toContain('夜深了，注意休息');
});

it('页面隐藏时停止等待，恢复可见立即校准并重新对齐', async () => {
  vi.setSystemTime(new Date(2026, 9, 5, 10, 0, 10));
  app = await mount(<LauncherClock />);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(vi.getTimerCount()).toBe(0);
  vi.setSystemTime(new Date(2026, 9, 6, 18, 42, 55));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(app.container.querySelector('time')?.textContent).toBe('18:42');
  expect(app.container.textContent).toContain('晚上好');
  await act(() => vi.advanceTimersByTime(5000));
  expect(app.container.querySelector('time')?.textContent).toBe('18:43');
});

it('卸载清理定时器及可见状态监听', async () => {
  app = await mount(<LauncherClock />);
  await app.cleanup();
  app = undefined;
  expect(vi.getTimerCount()).toBe(0);
  await act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(vi.getTimerCount()).toBe(0);
});
