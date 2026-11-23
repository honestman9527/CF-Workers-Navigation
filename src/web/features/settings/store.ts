import type { PublicSettings } from '@shared/api/types';

import {
  BG_OVERLAY_OPACITY_STORAGE_KEY,
  clampBgOverlayOpacity,
  DEFAULT_BG_OVERLAY_OPACITY,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  DEFAULT_VIEW_DENSITY,
  isPalette,
  isTheme,
  isViewDensity,
  PALETTE_STORAGE_KEY,
  parseBgOverlayOpacity,
  THEME_STORAGE_KEY,
  VIEW_DENSITY_STORAGE_KEY,
  type Palette,
  type Theme,
  type ViewDensity,
} from '@shared';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import { ApiError, api } from '@nav/api/client';

/** 旧主题存储 key：首次以新 key 写入时迁移，随后清理。 */
const LEGACY_THEME_STORAGE_KEY = 'nav-theme';
let memoryTheme = DEFAULT_THEME;
let themePersistenceFailed = false;

const themeStorage = {
  getItem: (key: string): Theme => {
    if (themePersistenceFailed) return memoryTheme;
    try {
      const current = window.localStorage.getItem(key);
      const legacy = isTheme(current)
        ? null
        : window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
      memoryTheme = isTheme(current) ? current : isTheme(legacy) ? legacy : DEFAULT_THEME;
    } catch {
      themePersistenceFailed = true;
      /* Storage may be unavailable; retain the preference for this page session. */
    }
    return memoryTheme;
  },
  setItem: (key: string, value: Theme) => {
    memoryTheme = value;
    try {
      window.localStorage.setItem(key, value);
      window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      themePersistenceFailed = false;
    } catch {
      themePersistenceFailed = true;
      /* The in-memory preference still applies when persistence is blocked. */
    }
  },
  removeItem: (key: string) => {
    memoryTheme = DEFAULT_THEME;
    try {
      window.localStorage.removeItem(key);
      themePersistenceFailed = false;
    } catch {
      themePersistenceFailed = true;
      /* optional preference */
    }
  },
};

function createResilientStorage<T>(
  fallback: T,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string,
) {
  let memory = fallback;
  let failed = false;
  return {
    getItem: (key: string): T => {
      if (failed) return memory;
      try {
        memory = parse(window.localStorage.getItem(key));
      } catch {
        failed = true;
      }
      return memory;
    },
    setItem: (key: string, value: T) => {
      memory = value;
      try {
        window.localStorage.setItem(key, serialize(value));
        failed = false;
      } catch {
        failed = true;
      }
    },
    removeItem: (key: string) => {
      memory = fallback;
      try {
        window.localStorage.removeItem(key);
        failed = false;
      } catch {
        failed = true;
      }
    },
  };
}

/** 主题偏好：持久化到 localStorage（读不到新值时回退旧 key 自动迁移）。 */
export const themeAtom = atomWithStorage<Theme>(THEME_STORAGE_KEY, DEFAULT_THEME, themeStorage, {
  getOnInit: true,
});

/** 主题色偏好：indigo | emerald | amber | rose。 */
export const paletteAtom = atomWithStorage<Palette>(
  PALETTE_STORAGE_KEY,
  DEFAULT_PALETTE,
  createResilientStorage<Palette>(
    DEFAULT_PALETTE,
    (raw) => (isPalette(raw) ? raw : DEFAULT_PALETTE),
    (value) => value,
  ),
  { getOnInit: true },
);

/** 前台书签卡片视图密度偏好：comfortable | compact。 */
export const viewDensityAtom = atomWithStorage<ViewDensity>(
  VIEW_DENSITY_STORAGE_KEY,
  DEFAULT_VIEW_DENSITY,
  createResilientStorage<ViewDensity>(
    DEFAULT_VIEW_DENSITY,
    (raw) => (isViewDensity(raw) ? raw : DEFAULT_VIEW_DENSITY),
    (value) => value,
  ),
  { getOnInit: true },
);

/** 自定义壁纸遮罩浓度偏好：0.25–0.95（默认 0.72）。 */
export const bgOverlayOpacityAtom = atomWithStorage<number>(
  BG_OVERLAY_OPACITY_STORAGE_KEY,
  DEFAULT_BG_OVERLAY_OPACITY,
  createResilientStorage<number>(
    DEFAULT_BG_OVERLAY_OPACITY,
    (raw) => parseBgOverlayOpacity(raw),
    (value) => String(clampBgOverlayOpacity(value)),
  ),
  { getOnInit: true },
);

const settingsDataAtom = atom<PublicSettings | null>(null);
const settingsErrorAtom = atom<string | null>(null);
const settingsLoadedAtom = atom(false);
const settingsRequestAtom = atom<Promise<void> | null>(null);
const settingsVersionAtom = atom(0);

/**
 * 服务端设置的共享加载器：首次调用后缓存，所有页面复用同一份数据，避免重复请求。
 * 401 时回调 onUnauthorized（经 ref 读取，见 useSettings）；`force` 可强制刷新。
 */
export const loadSettingsAtom = atom(
  null,
  (get, set, options?: { force?: boolean; onUnauthorized?: () => void }) => {
    const pending = get(settingsRequestAtom);
    if (pending) return pending;
    if (get(settingsLoadedAtom) && !options?.force) return;
    const version = get(settingsVersionAtom);
    set(settingsErrorAtom, null);
    const request = Promise.resolve()
      .then(() => api.getPublicSettings())
      .then((data) => {
        if (version !== get(settingsVersionAtom)) return;
        set(settingsDataAtom, data);
        set(settingsErrorAtom, null);
        set(settingsLoadedAtom, true);
      })
      .catch((caught: unknown) => {
        if (version !== get(settingsVersionAtom)) return;
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        set(settingsErrorAtom, caught instanceof Error ? caught.message : '加载设置失败');
        if (caught instanceof ApiError && caught.status === 401) options?.onUnauthorized?.();
      })
      .finally(() => set(settingsRequestAtom, null));
    set(settingsRequestAtom, request);
    return request;
  },
);

/** 设置快照：刷新时保留已有数据，错误与加载进度供页面展示恢复入口。 */
export const settingsStateAtom = atom((get) => ({
  settings: get(settingsDataAtom),
  error: get(settingsErrorAtom),
  loaded: get(settingsLoadedAtom),
  loading: get(settingsRequestAtom) !== null,
}));

/** 写入服务端确认的设置，使已挂载的前台同步更新。 */
export const updateSettingsCacheAtom = atom(null, (get, set, settings: PublicSettings) => {
  set(settingsVersionAtom, get(settingsVersionAtom) + 1);
  const { searchEngines, defaultEngineId, backgroundImageUrl, backgroundImageEnabled } = settings;
  set(settingsDataAtom, {
    searchEngines,
    defaultEngineId,
    backgroundImageUrl,
    backgroundImageEnabled,
  });
  set(settingsErrorAtom, null);
  set(settingsLoadedAtom, true);
});
