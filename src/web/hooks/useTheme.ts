import { DEFAULT_THEME, THEME_STORAGE_KEY, resolveThemePreference, type Theme } from '@shared';
import { useEffect, useState } from 'react';

const LEGACY_THEME_STORAGE_KEY = 'nav-theme';

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    return resolveThemePreference(
      (key) => window.localStorage.getItem(key),
      [LEGACY_THEME_STORAGE_KEY],
    );
  });

  useEffect(() => {
    applyThemeClass(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return {
    theme,
    setTheme(themeName: Theme) {
      setThemeState(themeName);
    },
  };
}
