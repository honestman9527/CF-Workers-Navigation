export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<Theme, 'system'>;
export type ThemeStorageReader = (key: string) => string | null;

export const DEFAULT_THEME: Theme = 'light';
export const THEME_STORAGE_KEY = 'lacquer-shift-theme';

export type Palette = 'indigo' | 'emerald' | 'amber' | 'rose';
export const DEFAULT_PALETTE: Palette = 'indigo';
export const PALETTE_STORAGE_KEY = 'nav-palette';

export type PaletteOption = {
  readonly id: Palette;
  readonly label: string;
  readonly light: string;
  readonly dark: string;
};

export const PALETTE_OPTIONS: readonly PaletteOption[] = [
  { id: 'indigo', label: '靛蓝晴空', light: '#4f46e5', dark: '#818cf8' },
  { id: 'emerald', label: '翡翠森语', light: '#059669', dark: '#34d399' },
  { id: 'amber', label: '暖珀微光', light: '#d97706', dark: '#fbbf24' },
  { id: 'rose', label: '玫瑰暮霞', light: '#e11d48', dark: '#fb7185' },
] as const;

export type ViewDensity = 'comfortable' | 'compact';
export const DEFAULT_VIEW_DENSITY: ViewDensity = 'comfortable';
export const VIEW_DENSITY_STORAGE_KEY = 'nav-view-density';

export const DEFAULT_BG_OVERLAY_OPACITY = 0.72;
export const MIN_BG_OVERLAY_OPACITY = 0.25;
export const MAX_BG_OVERLAY_OPACITY = 0.95;
export const BG_OVERLAY_OPACITY_STORAGE_KEY = 'nav-bg-overlay-opacity';

export function isTheme(value: string | null | undefined): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function isPalette(value: string | null | undefined): value is Palette {
  return value === 'indigo' || value === 'emerald' || value === 'amber' || value === 'rose';
}

export function isViewDensity(value: string | null | undefined): value is ViewDensity {
  return value === 'comfortable' || value === 'compact';
}

export function clampBgOverlayOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BG_OVERLAY_OPACITY;
  const clamped = Math.min(MAX_BG_OVERLAY_OPACITY, Math.max(MIN_BG_OVERLAY_OPACITY, value));
  return Math.round(clamped * 100) / 100;
}

export function parseBgOverlayOpacity(value: string | null | undefined): number {
  if (value === null || value === undefined || value.trim() === '') {
    return DEFAULT_BG_OVERLAY_OPACITY;
  }
  const parsed = Number(value);
  return clampBgOverlayOpacity(parsed);
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

export function resolvePalettePreference(read: ThemeStorageReader): Palette {
  const current = read(PALETTE_STORAGE_KEY);
  return isPalette(current) ? current : DEFAULT_PALETTE;
}
