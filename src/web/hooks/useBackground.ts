import type { Settings } from '@shared/api/types';

import { useLayoutEffect } from 'react';

/**
 * 把设置里的背景图片应用到全局（html 元素上的 `has-background` class + `--bg-image` 变量），
 * 样式见 `src/web/styles.css`。启动台与工作区各挂一次，页面切换时重设避免闪底色。
 * 卸载或禁用/清空时恢复纯色纸面。
 */
export function useBackground(settings: Settings | null) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const url = settings?.backgroundImageUrl?.trim();
    const on = Boolean(settings?.backgroundImageEnabled && url);

    if (on) {
      root.style.setProperty('--bg-image', `url("${url}")`);
      root.classList.add('has-background');
    } else {
      root.style.removeProperty('--bg-image');
      root.classList.remove('has-background');
    }

    return () => {
      root.style.removeProperty('--bg-image');
      root.classList.remove('has-background');
    };
  }, [settings]);
}
