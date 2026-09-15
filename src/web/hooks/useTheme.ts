import type { ResolvedTheme } from '@shared';

import { resolveTheme } from '@shared';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useState } from 'react';

import { themeAtom } from '@nav/features/settings/store';

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light';
}

function applyThemeClass(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  root.style.colorScheme = theme;
  document
    .querySelector<HTMLLinkElement>('#site-favicon')
    ?.setAttribute('href', `/hm-${theme}.svg?v=1`);
}

/** 主题偏好：读写 jotai 持久化原子，并把解析后的主题应用到根元素。 */
export function useTheme() {
  const theme = useAtomValue(themeAtom);
  const setTheme = useSetAtom(themeAtom);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystemTheme);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(SYSTEM_THEME_QUERY);
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light');
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  const resolvedTheme = resolveTheme(theme, systemTheme === 'dark');

  useEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
  };
}
