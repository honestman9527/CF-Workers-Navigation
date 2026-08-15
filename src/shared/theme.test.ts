import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  resolveThemePreference,
  type ThemeStorageReader,
} from './theme';

function reader(values: Record<string, string | undefined>): ThemeStorageReader {
  return (key) => values[key] ?? null;
}

describe('theme preference contract', () => {
  it('defaults to light', () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(resolveThemePreference(reader({}))).toBe('light');
    expect(resolveThemePreference(reader({ [THEME_STORAGE_KEY]: 'system' }))).toBe('light');
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
    expect(resolveThemePreference(reader({ 'nav-theme': 'system' }), ['nav-theme'])).toBe('light');
  });
});
