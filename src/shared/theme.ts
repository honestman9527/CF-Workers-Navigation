export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<Theme, 'system'>;
export type ThemeStorageReader = (key: string) => string | null;

export const DEFAULT_THEME: Theme = 'light';
export const THEME_STORAGE_KEY = 'lacquer-shift-theme';

export function isTheme(value: string | null | undefined): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
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
