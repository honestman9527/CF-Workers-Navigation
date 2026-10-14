import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef } from 'react';

import { loadSettingsAtom, settingsStateAtom } from '@nav/features/settings/store';

/**
 * 读取服务端设置（搜索引擎、favicon、背景图片等）。
 * 数据经 jotai 原子缓存，多个页面共享同一份（只请求一次）；401 时回调 onUnauthorized
 * （经 ref 读取，不依赖回调的引用稳定性）。
 */
export function useSettings(onUnauthorized?: () => void) {
  const { settings, loading, error, loaded } = useAtomValue(settingsStateAtom);
  const loadSettings = useSetAtom(loadSettingsAtom);
  const onUnauthorizedRef = useRef(onUnauthorized);

  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  useEffect(() => {
    if (!loaded && !loading && !error)
      void loadSettings({ onUnauthorized: () => onUnauthorizedRef.current?.() });
  }, [loadSettings, loaded, loading, error]);

  const retry = useCallback(() => {
    void loadSettings({ force: true, onUnauthorized: () => onUnauthorizedRef.current?.() });
  }, [loadSettings]);

  return { settings, loading, error, retry };
}
