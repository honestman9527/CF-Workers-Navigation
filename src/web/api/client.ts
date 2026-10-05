import type { ImportStrategy, ImportSummary } from '@shared/api/types';

import { createApiClient, ApiError } from '@shared/api/client';
import { ENDPOINTS, buildQuery } from '@shared/api/endpoints';

export { ApiError };

const pendingRequests = new Set<AbortController>();
export function invalidateApiRequests() {
  for (const controller of pendingRequests) controller.abort();
  pendingRequests.clear();
}

const client = createApiClient({
  fetch: async (input, init) => {
    const controller = new AbortController();
    pendingRequests.add(controller);
    try {
      const signal = init?.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal;
      const response = await globalThis.fetch(input, { ...init, signal, credentials: 'include' });
      signal.throwIfAborted();
      if (
        response.headers.get('X-Nav-Authenticated') === 'false' &&
        !String(input).includes('/auth/')
      ) {
        window.dispatchEvent(new Event('nav-session-expired'));
        signal.throwIfAborted();
      }
      return response;
    } finally {
      pendingRequests.delete(controller);
    }
  },
});

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  ...client,
  importDataAuto(
    content: string,
    strategy: ImportStrategy = 'skip',
    onProgress?: (loaded: number, total: number) => void,
  ): { promise: Promise<ImportSummary>; abort: () => void } {
    const path = `${ENDPOINTS.transferImport}${buildQuery({ format: 'auto', strategy })}`;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');

    const promise = new Promise<ImportSummary>((resolve, reject) => {
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(event.loaded, event.total);
          }
        };
      }
      xhr.onload = () => {
        const contentType = xhr.getResponseHeader('Content-Type') ?? '';
        const parsed = contentType.includes('application/json')
          ? (safeParse(xhr.responseText) as ImportSummary)
          : null;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as ImportSummary);
          return;
        }
        const shape = (parsed ?? {}) as { error?: { code?: string; message?: string } };
        reject(new ApiError(xhr.status, shape.error?.message ?? '导入失败', shape.error?.code));
      };
      xhr.onerror = () => reject(new ApiError(0, '网络错误，请检查连接后重试'));
      xhr.onabort = () => reject(new DOMException('已停止等待导入', 'AbortError'));
      xhr.ontimeout = () => reject(new ApiError(0, '请求超时，请重试'));
      xhr.send(content);
    });

    return {
      promise,
      abort: () => xhr.abort(),
    };
  },
};
