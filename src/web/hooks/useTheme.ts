import type { Theme } from '@shared';

import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';

import { themeAtom } from '@nav/features/settings/store';

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  root.style.colorScheme = theme;
  document
    .querySelector<HTMLLinkElement>('#site-favicon')
    ?.setAttribute('href', `/hm-${theme}.svg?v=1`);
}

/** 主题偏好：读写 jotai 持久化原子（localStorage + 旧 key 迁移），并把 class 应用到根元素。 */
export function useTheme() {
  const theme = useAtomValue(themeAtom);
  const setTheme = useSetAtom(themeAtom);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  return {
    theme,
    setTheme,
  };
}
