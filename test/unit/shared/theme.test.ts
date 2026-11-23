import { describe, expect, it } from 'vitest';

import {
  clampBgOverlayOpacity,
  DEFAULT_BG_OVERLAY_OPACITY,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  DEFAULT_VIEW_DENSITY,
  isPalette,
  isViewDensity,
  MAX_BG_OVERLAY_OPACITY,
  MIN_BG_OVERLAY_OPACITY,
  PALETTE_OPTIONS,
  PALETTE_STORAGE_KEY,
  parseBgOverlayOpacity,
  resolvePalettePreference,
  resolveTheme,
  resolveThemePreference,
  THEME_STORAGE_KEY,
  type ThemeStorageReader,
} from '@shared/theme';

function reader(values: Record<string, string | undefined>): ThemeStorageReader {
  return (key) => values[key] ?? null;
}

describe('theme preference contract', () => {
  it('defaults to light', () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(resolveThemePreference(reader({}))).toBe('light');
    expect(resolveThemePreference(reader({ [THEME_STORAGE_KEY]: 'system' }))).toBe('system');
  });

  it('prefers a valid canonical preference', () => {
    expect(
      resolveThemePreference(reader({ [THEME_STORAGE_KEY]: 'dark', 'nav-theme': 'light' }), [
        'nav-theme',
      ]),
    ).toBe('dark');
  });

  it('falls back through valid legacy preferences', () => {
    expect(resolveThemePreference(reader({ 'nav-theme': 'dark' }), ['nav-theme'])).toBe('dark');
    expect(resolveThemePreference(reader({ 'nav-theme': 'system' }), ['nav-theme'])).toBe('system');
  });

  it('resolves system preference from the operating system theme', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('appearance preference contract', () => {
  it('supports 4 palettes and falls back to indigo', () => {
    expect(DEFAULT_PALETTE).toBe('indigo');
    expect(PALETTE_OPTIONS.map((item) => item.id)).toEqual(['indigo', 'emerald', 'amber', 'rose']);
    expect(isPalette('emerald')).toBe(true);
    expect(isPalette('violet')).toBe(false);
    expect(resolvePalettePreference(reader({}))).toBe('indigo');
    expect(resolvePalettePreference(reader({ [PALETTE_STORAGE_KEY]: 'rose' }))).toBe('rose');
    expect(resolvePalettePreference(reader({ [PALETTE_STORAGE_KEY]: 'invalid' }))).toBe('indigo');
  });

  it('validates view density values', () => {
    expect(DEFAULT_VIEW_DENSITY).toBe('comfortable');
    expect(isViewDensity('comfortable')).toBe(true);
    expect(isViewDensity('compact')).toBe(true);
    expect(isViewDensity('dense')).toBe(false);
  });

  it('clamps and parses background overlay opacity within 25%–95%', () => {
    expect(DEFAULT_BG_OVERLAY_OPACITY).toBe(0.72);
    expect(clampBgOverlayOpacity(0.1)).toBe(MIN_BG_OVERLAY_OPACITY);
    expect(clampBgOverlayOpacity(1.2)).toBe(MAX_BG_OVERLAY_OPACITY);
    expect(clampBgOverlayOpacity(0.684)).toBe(0.68);
    expect(clampBgOverlayOpacity(Number.NaN)).toBe(DEFAULT_BG_OVERLAY_OPACITY);
    expect(parseBgOverlayOpacity(null)).toBe(DEFAULT_BG_OVERLAY_OPACITY);
    expect(parseBgOverlayOpacity('')).toBe(DEFAULT_BG_OVERLAY_OPACITY);
    expect(parseBgOverlayOpacity('0.5')).toBe(0.5);
    expect(parseBgOverlayOpacity('0.05')).toBe(MIN_BG_OVERLAY_OPACITY);
    expect(parseBgOverlayOpacity('99')).toBe(MAX_BG_OVERLAY_OPACITY);
  });
});
