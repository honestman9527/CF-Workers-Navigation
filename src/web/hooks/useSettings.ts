import type { Settings } from '@shared/api/types';

import { useEffect, useRef, useState } from 'react';

import { ApiError, api } from '@nav/api/client';

/**
 * 读取服务端设置（搜索引擎、favicon、背景图片等）。
 * 挂载时请求一次并缓存到本地 state；401 时回调 onUnauthorized（经 ref 读取，
 * 不依赖回调的引用稳定性）。
 */
export function useSettings(onUnauthorized?: () => void): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  const onUnauthorizedRef = useRef(onUnauthorized);

  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  useEffect(() => {
    let alive = true;
    api
      .getSettings()
      .then((data) => {
        if (alive) setSettings(data);
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) {
          onUnauthorizedRef.current?.();
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return settings;
}
