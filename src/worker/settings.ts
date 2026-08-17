import type { DrizzleD1Database } from 'drizzle-orm/d1';

import { sql } from 'drizzle-orm';

import { settings } from './schema';

const DEFAULTS = {
  favicon_proxy_url: 'https://www.google.com/s2/favicons?domain={domain}&sz=64',
  favicon_proxy_enabled: 'true',
} as const;

export type SettingKey = keyof typeof DEFAULTS;

export type SettingsConfig = {
  faviconProxyUrl: string;
  faviconProxyEnabled: boolean;
};

const KEY_MAP: Record<keyof SettingsConfig, SettingKey> = {
  faviconProxyUrl: 'favicon_proxy_url',
  faviconProxyEnabled: 'favicon_proxy_enabled',
};

const REVERSE_MAP: Record<SettingKey, keyof SettingsConfig> = {
  favicon_proxy_url: 'faviconProxyUrl',
  favicon_proxy_enabled: 'faviconProxyEnabled',
};

function parseValue(key: SettingKey, raw: string): string | boolean {
  if (key === 'favicon_proxy_enabled') {
    return raw === 'true';
  }
  return raw;
}

function toDbValue(key: SettingKey, value: string | boolean): string {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return value;
}

export async function getSettings(db: DrizzleD1Database): Promise<SettingsConfig> {
  const rows = await db.select().from(settings);

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }

  const result = {} as Record<keyof SettingsConfig, string | boolean>;
  for (const dbKey of Object.keys(DEFAULTS) as SettingKey[]) {
    const raw = map.get(dbKey) ?? DEFAULTS[dbKey];
    const configKey = REVERSE_MAP[dbKey];
    result[configKey] = parseValue(dbKey, raw);
  }

  return result as unknown as SettingsConfig;
}

export async function updateSettings(
  db: DrizzleD1Database,
  partial: Partial<SettingsConfig>,
): Promise<SettingsConfig> {
  const entries = Object.entries(partial) as [keyof SettingsConfig, string | boolean][];

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

export function defaultSettings(): SettingsConfig {
  return {
    faviconProxyUrl: DEFAULTS.favicon_proxy_url,
    faviconProxyEnabled: DEFAULTS.favicon_proxy_enabled === 'true',
  };
}
