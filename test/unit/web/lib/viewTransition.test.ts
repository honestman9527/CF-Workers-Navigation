// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { runViewTransition } from '@/lib/viewTransition';

function mockReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: reduced,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  mockReducedMotion(false);
  delete document.documentElement.dataset.vtKind;
  document.documentElement.style.removeProperty('--vt-x');
  document.documentElement.style.removeProperty('--vt-y');
  document.documentElement.style.removeProperty('--vt-r');
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
});

it('浏览器不支持 startViewTransition 时直接同步执行更新', () => {
  const update = vi.fn();
  runViewTransition(update, { kind: 'fade' });
  expect(update).toHaveBeenCalledOnce();
  expect(document.documentElement.dataset.vtKind).toBeUndefined();
});

it('开启 prefers-reduced-motion 时跳过 startViewTransition 直接更新', () => {
  mockReducedMotion(true);
  const startViewTransition = vi.fn();
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: startViewTransition,
  });

  const update = vi.fn();
  runViewTransition(update, { kind: 'ripple' });

  expect(startViewTransition).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledOnce();
});

it('ripple 模式写入触发中心坐标与最大半径，并在 finished 后清理临时样式', async () => {
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  const startViewTransition = vi.fn((callback: () => void) => {
    callback();
    return { finished };
  });
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: startViewTransition,
  });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });

  const origin = document.createElement('button');
  origin.getBoundingClientRect = () => ({ left: 80, top: 60, width: 40, height: 40 }) as DOMRect;

  const update = vi.fn();
  runViewTransition(update, { kind: 'ripple', origin });

  expect(startViewTransition).toHaveBeenCalledOnce();
  expect(update).toHaveBeenCalledOnce();
  expect(document.documentElement.dataset.vtKind).toBe('ripple');
  expect(document.documentElement.style.getPropertyValue('--vt-x')).toBe('100px');
  expect(document.documentElement.style.getPropertyValue('--vt-y')).toBe('80px');
  const expectedRadius = Math.hypot(900, 720);
  expect(
    Number(document.documentElement.style.getPropertyValue('--vt-r').replace('px', '')),
  ).toBeCloseTo(expectedRadius, 2);

  resolveFinished();
  await finished;
  await Promise.resolve();

  expect(document.documentElement.dataset.vtKind).toBeUndefined();
  expect(document.documentElement.style.getPropertyValue('--vt-x')).toBe('');
  expect(document.documentElement.style.getPropertyValue('--vt-y')).toBe('');
  expect(document.documentElement.style.getPropertyValue('--vt-r')).toBe('');
});

it('finished 被取消拒绝时仍清理临时状态且不产生未处理异常', async () => {
  let rejectFinished!: (reason?: unknown) => void;
  const finished = new Promise<void>((_, reject) => {
    rejectFinished = reject;
  });
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: vi.fn((callback: () => void) => {
      callback();
      return { finished };
    }),
  });

  const update = vi.fn();
  runViewTransition(update, { kind: 'fade' });
  expect(document.documentElement.dataset.vtKind).toBe('fade');

  rejectFinished(new DOMException('Transition aborted', 'AbortError'));
  await expect(finished).rejects.toThrow();
  await Promise.resolve();

  expect(document.documentElement.dataset.vtKind).toBeUndefined();
});
