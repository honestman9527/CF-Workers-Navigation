import type { PublicSettings } from '@shared/api/types';

import { clampBgOverlayOpacity } from '@shared';
import { useLayoutEffect } from 'react';

/** 校验并转义自定义背景图片 URL，防止非 HTTP(S) 协议或引号/括号破坏 CSS 变量。 */
function safeCssBackgroundUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const escaped = parsed.href.replace(/["\\\r\n\f]/g, (ch) => encodeURIComponent(ch));
    return `url("${escaped}")`;
  } catch {
    return null;
  }
}

/**
 * 把设置里的背景图片应用到全局（html 元素上的 `has-background` class + `--bg-image` 变量），
 * 并配合固定遮罩浓度 `--bg-overlay-opacity` 与背景模糊保障卡片文字可读性，样式见 `src/web/styles.css`。
 * 卸载或禁用/清空时恢复纯色 Slate 表面。
 */
export function useBackground(settings: PublicSettings | null, overlayOpacity?: number) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const cssUrl = settings?.backgroundImageEnabled
      ? safeCssBackgroundUrl(settings.backgroundImageUrl)
      : null;

    if (cssUrl) {
      root.style.setProperty('--bg-image', cssUrl);
      if (overlayOpacity !== undefined) {
        root.style.setProperty(
          '--bg-overlay-opacity',
          String(clampBgOverlayOpacity(overlayOpacity)),
        );
      }
      root.classList.add('has-background');
    } else {
      root.style.removeProperty('--bg-image');
      root.classList.remove('has-background');
    }

    return () => {
      root.style.removeProperty('--bg-image');
      root.classList.remove('has-background');
    };
  }, [settings, overlayOpacity]);
}
