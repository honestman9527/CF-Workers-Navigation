import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyTheme, initializeTheme, setupThemeSync } from './theme';

const syncGet = vi.fn();
const addListener = vi.fn();
const removeListener = vi.fn();

beforeEach(() => {
  syncGet.mockReset();
  addListener.mockReset();
  removeListener.mockReset();
  vi.stubGlobal('chrome', {
    storage: {
      sync: { get: syncGet },
      onChanged: { addListener, removeListener },
    },
  });
});

describe('extension theme preference', () => {
  it('applies theme class to document element when document exists', () => {
    const root = {
      classList: {
        remove: vi.fn(),
        add: vi.fn(),
      },
      style: { colorScheme: '' },
    };
    vi.stubGlobal('document', { documentElement: root });

    applyTheme('dark');
    expect(root.classList.remove).toHaveBeenCalledWith('light', 'dark');
    expect(root.classList.add).toHaveBeenCalledWith('dark');
    expect(root.style.colorScheme).toBe('dark');
  });

  it('initializes theme from ExtConfig storage', async () => {
    const root = {
      classList: {
        remove: vi.fn(),
        add: vi.fn(),
      },
      style: { colorScheme: '' },
    };
    vi.stubGlobal('document', { documentElement: root });
    syncGet.mockResolvedValue({ nav_ext_config: { theme: 'light' } });

    const theme = await initializeTheme();
    expect(theme).toBe('light');
    expect(root.classList.add).toHaveBeenCalledWith('light');
  });

  it('sets up sync listener for theme changes', () => {
    setupThemeSync();
    expect(addListener).toHaveBeenCalledTimes(1);
  });
});
