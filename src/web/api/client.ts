import type { ImportStrategy, ImportSummary } from '@shared/api/types';

import { createApiClient, ApiError } from '@shared/api/client';
import { ENDPOINTS, buildQuery } from '@shared/api/endpoints';

export { ApiError };

const client = createApiClient({
  fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: 'include' }),
});

type ExportResult = {
  blob: Blob;
  filename: string;
};

async function exportData(format: 'html' | 'json'): Promise<ExportResult> {
  const response = await fetch(`${ENDPOINTS.transferExport}${buildQuery({ format })}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') ?? '';
    const body = contentType.includes('application/json')
      ? ((await response.json()) as { error?: { code?: string; message?: string } })
      : null;
    throw new ApiError(response.status, body?.error?.message ?? '导出失败', body?.error?.code);
  }

  const filename =
    response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1] ??
    `nav-export.${format}`;
  return { blob: await response.blob(), filename };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  ...client,
  exportData,
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
      xhr.ontimeout = () => reject(new ApiError(0, '请求超时，请重试'));
      xhr.send(content);
    });

    return {
      promise,
      abort: () => xhr.abort(),
    };
  },
};
