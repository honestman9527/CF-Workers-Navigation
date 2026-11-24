import type { ResolvedTheme, Theme } from '@shared';

import { resolveTheme } from '@shared';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useState } from 'react';

import { themeAtom } from '@nav/features/settings/store';

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light';
}

function applyTheme(preference: Theme, resolved: ResolvedTheme) {
  const root = document.documentElement;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = preference === 'system' ? 'light dark' : preference;
  }
  root.classList.remove('dark', 'light');
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  document
    .querySelector<HTMLLinkElement>('#site-favicon')
    ?.setAttribute('href', `/hm-${resolved}.svg?v=1`);
}

/** 主题偏好：读写 jotai 持久化原子，同步 <meta name="color-scheme"> 与根元素主题类。 */
export function useTheme() {
  const theme = useAtomValue(themeAtom);
  const setTheme = useSetAtom(themeAtom);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystemTheme);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(SYSTEM_THEME_QUERY);
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const resolvedTheme = resolveTheme(theme, systemTheme === 'dark');

  useEffect(() => {
    applyTheme(theme, resolvedTheme);
  }, [theme, resolvedTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
  };
}
