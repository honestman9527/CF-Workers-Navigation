import type { Settings } from '@shared/api/types';

import { DEFAULT_THEME, THEME_STORAGE_KEY, type Theme } from '@shared';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import { ApiError, api } from '@nav/api/client';

/** 旧主题存储 key：首次以新 key 写入时迁移，随后清理。 */
const LEGACY_THEME_STORAGE_KEY = 'nav-theme';

/** 前台视图偏好（启动台 / 或书签柜工作区 /workspace）存储 Key */
export const FRONT_VIEW_STORAGE_KEY = 'nav-front-view';
export type FrontViewMode = 'launcher' | 'workspace';

export function getPreferredFrontView(): FrontViewMode {
  try {
    const value = window.localStorage.getItem(FRONT_VIEW_STORAGE_KEY);
    return value === 'workspace' ? 'workspace' : 'launcher';
  } catch {
    return 'launcher';
  }
}

export function setPreferredFrontView(mode: FrontViewMode): void {
  try {
    window.localStorage.setItem(FRONT_VIEW_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function getPreferredFrontRoute(): '/launch' | '/workspace' {
  return getPreferredFrontView() === 'workspace' ? '/workspace' : '/launch';
}

const themeStorage = {
  getItem: (key: string): Theme => {
    const current = window.localStorage.getItem(key);
    if (current === 'light' || current === 'dark') return current;
    const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    return legacy === 'dark' ? 'dark' : DEFAULT_THEME;
  },
  setItem: (key: string, value: Theme) => {
    window.localStorage.setItem(key, value);
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  },
  removeItem: (key: string) => window.localStorage.removeItem(key),
};

/** 主题偏好：持久化到 localStorage（读不到新值时回退旧 key 自动迁移）。 */
export const themeAtom = atomWithStorage<Theme>(THEME_STORAGE_KEY, DEFAULT_THEME, themeStorage, {
  getOnInit: true,
});

const settingsDataAtom = atom<Settings | null>(null);
const settingsErrorAtom = atom<string | null>(null);
const settingsLoadedAtom = atom(false);

/**
 * 服务端设置的共享加载器：首次调用后缓存，所有页面复用同一份数据，避免重复请求。
 * 401 时回调 onUnauthorized（经 ref 读取，见 useSettings）；`force` 可强制刷新。
 */
export const loadSettingsAtom = atom(
  null,
  async (get, set, options?: { force?: boolean; onUnauthorized?: () => void }) => {
    if (get(settingsLoadedAtom) && !options?.force) return;
    try {
      const data = await api.getSettings();
      set(settingsDataAtom, data);
      set(settingsErrorAtom, null);
      set(settingsLoadedAtom, true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        options?.onUnauthorized?.();
        return;
      }
      set(settingsErrorAtom, caught instanceof Error ? caught.message : '加载设置失败');
    }
  },
);

/** 设置快照：挂载中的页面读取 settings，错误与加载进度留给 hook 内部使用。 */
export const settingsStateAtom = atom((get) => ({
  settings: get(settingsDataAtom),
  error: get(settingsErrorAtom),
  loaded: get(settingsLoadedAtom),
}));
