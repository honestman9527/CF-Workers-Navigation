import type { DrizzleD1Database } from 'drizzle-orm/d1';

import type { Settings } from '../shared/api/types';
import type { SearchEngine } from '../shared/search';

import { sql } from 'drizzle-orm';

import { DEFAULT_SEARCH_ENGINES } from '../shared/search';
import { settings } from './schema';

const DEFAULTS = {
  default_category_visibility: 'public',
  default_bookmark_visibility: 'public',
  favicon_proxy_url: 'https://www.google.com/s2/favicons?domain={domain}&sz=64',
  favicon_proxy_enabled: 'true',
  search_engines: JSON.stringify(DEFAULT_SEARCH_ENGINES),
  default_engine_id: 'google',
  background_image_url: '',
  background_image_enabled: 'false',
} as const;

export type SettingKey = keyof typeof DEFAULTS;

export type SettingsConfig = Settings;

const KEY_MAP: Record<keyof SettingsConfig, SettingKey> = {
  defaultCategoryVisibility: 'default_category_visibility',
  defaultBookmarkVisibility: 'default_bookmark_visibility',
  faviconProxyUrl: 'favicon_proxy_url',
  faviconProxyEnabled: 'favicon_proxy_enabled',
  searchEngines: 'search_engines',
  defaultEngineId: 'default_engine_id',
  backgroundImageUrl: 'background_image_url',
  backgroundImageEnabled: 'background_image_enabled',
};

const REVERSE_MAP: Record<SettingKey, keyof SettingsConfig> = {
  default_category_visibility: 'defaultCategoryVisibility',
  default_bookmark_visibility: 'defaultBookmarkVisibility',
  favicon_proxy_url: 'faviconProxyUrl',
  favicon_proxy_enabled: 'faviconProxyEnabled',
  search_engines: 'searchEngines',
  default_engine_id: 'defaultEngineId',
  background_image_url: 'backgroundImageUrl',
  background_image_enabled: 'backgroundImageEnabled',
};

type SettingValue = string | boolean | SearchEngine[];

function parseSearchEngines(raw: string): SearchEngine[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as SearchEngine).id === 'string' &&
          typeof (item as SearchEngine).name === 'string' &&
          typeof (item as SearchEngine).url === 'string' &&
          typeof (item as SearchEngine).builtin === 'boolean',
      )
    ) {
      return parsed as SearchEngine[];
    }
  } catch {
    /* 损坏的 JSON 回退默认值 */
  }
  return DEFAULT_SEARCH_ENGINES;
}

/** 内置引擎不可删除：写入前把被删的内置项补回。 */
function withBuiltinEngines(engines: SearchEngine[]): SearchEngine[] {
  const merged = [...engines];
  for (const builtin of DEFAULT_SEARCH_ENGINES) {
    if (!merged.some((engine) => engine.id === builtin.id)) {
      merged.push(builtin);
    }
  }
  return merged;
}

function parseValue(key: SettingKey, raw: string): SettingValue {
  if (key === 'default_category_visibility' || key === 'default_bookmark_visibility')
    return raw === 'public' ? 'public' : 'private';
  if (key === 'favicon_proxy_enabled' || key === 'background_image_enabled') {
    return raw === 'true';
  }
  if (key === 'search_engines') return parseSearchEngines(raw);
  return raw;
}

function toDbValue(key: SettingKey, value: SettingValue): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (key === 'search_engines') return JSON.stringify(value);
  return value as string;
}

export async function getSettings(db: DrizzleD1Database): Promise<SettingsConfig> {
  const rows = await db.select().from(settings);

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }

  const result = {} as Record<keyof SettingsConfig, SettingValue>;
  for (const dbKey of Object.keys(DEFAULTS) as SettingKey[]) {
    const raw = map.get(dbKey) ?? DEFAULTS[dbKey];
    result[REVERSE_MAP[dbKey]] = parseValue(dbKey, raw);
  }

  return result as unknown as SettingsConfig;
}

export async function updateSettings(
  db: DrizzleD1Database,
  partial: Partial<SettingsConfig>,
): Promise<SettingsConfig> {
  const input =
    partial.searchEngines !== undefined
      ? { ...partial, searchEngines: withBuiltinEngines(partial.searchEngines) }
      : partial;

  const entries = Object.entries(input) as [keyof SettingsConfig, SettingValue][];

  const [first, ...rest] = entries.map(([configKey, value]) => {
    const dbKey = KEY_MAP[configKey];
    const dbValue = toDbValue(dbKey, value);
    return db
      .insert(settings)
      .values({ key: dbKey, value: dbValue })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: dbValue, updatedAt: sql`CURRENT_TIMESTAMP` },
      });
  });

  if (first !== undefined) {
    await db.batch([first, ...rest]);
  }

  return getSettings(db);
}
