import { flushSync } from 'react-dom';

export type ViewTransitionOptions = {
  origin?: HTMLElement | null;
  kind?: 'ripple' | 'fade';
};

/**
 * 以原生 View Transitions API 包裹状态切换；不支持或开启减少动态偏好时直接同步更新。
 * 若传入 `kind: 'ripple'` 与触发元素，则从触发中心展开圆形光圈过渡。
 */
export function runViewTransition(update: () => void, options?: ViewTransitionOptions) {
  if (
    typeof document === 'undefined' ||
    typeof document.startViewTransition !== 'function' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    update();
    return;
  }

  const root = document.documentElement;
  const kind = options?.kind ?? 'fade';
  const origin = options?.origin;

  if (kind === 'ripple' && origin) {
    const rect = origin.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);
    root.style.setProperty('--vt-r', `${radius}px`);
    root.dataset.vtKind = 'ripple';
  } else {
    root.dataset.vtKind = 'fade';
  }

  const cleanup = () => {
    delete root.dataset.vtKind;
    root.style.removeProperty('--vt-x');
    root.style.removeProperty('--vt-y');
    root.style.removeProperty('--vt-r');
  };

  try {
    const transition = document.startViewTransition(() => {
      flushSync(update);
    });
    void transition.finished.then(cleanup, cleanup);
  } catch {
    cleanup();
    update();
  }
}
