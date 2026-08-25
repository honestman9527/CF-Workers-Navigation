import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@nav/api/client';

type UseApiDataOptions = {
  /** 401 处理（通常是登出）。 */
  onUnauthorized?: () => void;
  /** 非 401 错误的额外处理；缺省时错误文案落在返回的 error 字段。 */
  onError?: (message: string) => void;
};

/**
 * 把「挂载时取数 + loading/error + 401」收敛为一个三态资源。
 * 内部处理 abort、卸载复位；refresh() 可重新请求；setData 供本地覆盖。
 * 数据为页面自有（非跨页共享缓存），共享跨页状态请用 settings/store 的 jotai 原子。
 */
export function useApiData<T>(
  load: (signal: AbortSignal) => Promise<T>,
  options?: UseApiDataOptions,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    load(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        if (caught instanceof ApiError && caught.status === 401) {
          optionsRef.current?.onUnauthorized?.();
          return;
        }
        const message = caught instanceof Error ? caught.message : '加载失败';
        if (optionsRef.current?.onError) optionsRef.current.onError(message);
        else setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load, version]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  return { data, loading, error, refresh, setData };
}
