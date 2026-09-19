import type { ImportStrategy, TransferData } from '../transfer/types';
import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import { jsonError } from '../errors';
import { handleServiceError } from '../http';
import { ServiceError } from '../services/errors';
import { exportTransferData, importTransferData } from '../services/transfer';
import { detectFormat } from '../transfer/detect';
import { parseHtml, serializeHtml } from '../transfer/html';
import { parseJson, serializeJson } from '../transfer/json';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const formatQuerySchema = z.enum(['html', 'json', 'auto']);
const strategyQuerySchema = z.enum(['skip', 'create', 'update']).default('skip');

const transferRoutes = new Hono<AppEnv>();

function timestampForFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function filenameFromContentType(contentType: string): string {
  if (contentType.includes('application/json')) {
    return 'import.json';
  }
  if (contentType.includes('text/html')) {
    return 'import.html';
  }
  return 'import.bin';
}

transferRoutes.get('/export', async (c) => {
  const format = formatQuerySchema.parse(c.req.query('format'));
  if (format === 'auto') {
    return jsonError(c, 400, 'validation_error', '导出不支持自动识别，请指定 html 或 json');
  }
  const data = await exportTransferData(c.get('db'));

  if (format === 'json') {
    return new Response(serializeJson(data), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="nav-export-${timestampForFilename()}.json"`,
      },
    });
  }

  return new Response(serializeHtml(data), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="nav-export-${timestampForFilename()}.html"`,
    },
  });
});

transferRoutes.post('/import', async (c) => {
  const requestedFormat = formatQuerySchema.parse(c.req.query('format'));
  const strategy: ImportStrategy = strategyQuerySchema.parse(c.req.query('strategy'));

  const body = await c.req.text();
  if (new TextEncoder().encode(body).byteLength > MAX_IMPORT_BYTES) {
    return jsonError(c, 413, 'too_large', `文件过大（超过 ${MAX_IMPORT_BYTES / 1024 / 1024}MB）`);
  }

  let format: 'html' | 'json';
  try {
    format =
      requestedFormat === 'auto'
        ? detectFormat(filenameFromContentType(c.req.header('Content-Type') ?? ''), body)
        : requestedFormat;
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法识别文件格式';
    return jsonError(c, 400, 'validation_error', message);
  }

  let data: TransferData;
  try {
    data = format === 'json' ? parseJson(body) : parseHtml(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析失败';
    return jsonError(c, 400, 'validation_error', message);
  }

  try {
    const summary = await importTransferData(c.get('db'), data, strategy);
    return c.json(summary, 200);
  } catch (error) {
    if (error instanceof ServiceError) return handleServiceError(c, error);
    console.error('Bookmark import failed', error);
    return jsonError(c, 500, 'internal_error', '数据库写入失败，请查看 Worker 日志');
  }
});

export default transferRoutes;
