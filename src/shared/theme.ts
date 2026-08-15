export type Theme = 'light' | 'dark';
export type ThemeStorageReader = (key: string) => string | null;

export const DEFAULT_THEME: Theme = 'light';
export const THEME_STORAGE_KEY = 'lacquer-shift-theme';

export function isTheme(value: string | null | undefined): value is Theme {
  return value === 'light' || value === 'dark';
}

export function resolveThemePreference(
  read: ThemeStorageReader,
  legacyKeys: readonly string[] = [],
): Theme {
  const current = read(THEME_STORAGE_KEY);
  if (isTheme(current)) return current;

  for (const key of legacyKeys) {
    const legacy = read(key);
    if (isTheme(legacy)) return legacy;
  }

  return DEFAULT_THEME;
}
