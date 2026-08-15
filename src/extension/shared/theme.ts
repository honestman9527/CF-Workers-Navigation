import type { Theme } from '@shared';

import { getConfig, onConfigChange } from './storage';

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export async function initializeTheme(): Promise<Theme> {
  const cfg = await getConfig();
  applyTheme(cfg.theme);
  return cfg.theme;
}

export function setupThemeSync(): void {
  onConfigChange((cfg) => {
    applyTheme(cfg.theme);
  });
}
