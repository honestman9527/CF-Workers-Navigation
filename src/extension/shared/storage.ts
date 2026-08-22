import { DEFAULT_CONFIG } from "./config";
import type { ExtConfig } from "./config";

export const STORAGE_KEY = "nav_ext_config";

/**
 * 扩展端配置存储 helper。
 * 配置写入 chrome.storage.sync（跨设备同步），
 * popup / options / service worker 三处共享同一份配置。
 */

/** 读取完整配置，与默认配置合并。 */
export async function getConfig(): Promise<ExtConfig> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const stored = (result[STORAGE_KEY] ?? {}) as Partial<ExtConfig>;
  return mergeConfig(DEFAULT_CONFIG, stored);
}

/** 写入完整配置。 */
export async function setConfig(config: ExtConfig): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: config });
}

/** 增量更新部分字段。 */
export async function updateConfig(patch: Partial<ExtConfig>): Promise<ExtConfig> {
  const current = await getConfig();
  const next = mergeConfig(current, patch);
  await setConfig(next);
  return next;
}

/** 监听配置变化（用于多页面同步）。 */
export function onConfigChange(cb: (config: ExtConfig) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string
  ) => {
    if (area === "sync" && changes[STORAGE_KEY]) {
      const next = changes[STORAGE_KEY].newValue as ExtConfig | undefined;
      if (next) cb(next);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function mergeConfig(base: ExtConfig, patch: Partial<ExtConfig>): ExtConfig {
  return {
    apiBaseUrl: patch.apiBaseUrl ?? base.apiBaseUrl,
    adminToken: patch.adminToken ?? base.adminToken,
    theme: isTheme(patch.theme) ? patch.theme : base.theme,
  };
}

function isTheme(v: unknown): v is 'light' | 'dark' {
  return v === 'light' || v === 'dark';
}