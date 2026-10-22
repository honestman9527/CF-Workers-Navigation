import type { ImportStrategy, TransferData } from '../transfer/types';
import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z, ZodError } from 'zod';

import { jsonError } from '../errors';
import { handleServiceError } from '../http';
import { createTransferLog } from '../observability';
import { ServiceError } from '../services/errors';
import { importTransferData } from '../services/transfer';
import { exportTransferStream, prepareTransferExport } from '../services/transfer-export';
import { detectFormat } from '../transfer/detect';
import { parseHtml } from '../transfer/html';
import { parseJson } from '../transfer/json';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const formatQuerySchema = z.enum(['html', 'json', 'auto']);
const strategyQuerySchema = z.enum(['skip', 'create', 'update']).default('skip');

async function readImportBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMPORT_BYTES) {
        await reader.cancel('Import exceeds the body size limit');
        return null;
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } finally {
    reader.releaseLock();
  }
}

const transferRoutes = new Hono<AppEnv>();

transferRoutes.get('/export/prepare', async (c) => {
  const log = createTransferLog('export-prepare', c.get('requestId'));
  try {
    const format = formatQuerySchema.parse(c.req.query('format'));
    if (format === 'auto') {
      log.finish('rejected');
      return jsonError(c, 400, 'validation_error', '导出不支持自动识别，请指定 html 或 json');
    }
    log.format(format);
    await prepareTransferExport(c.get('db'), log);
    return c.json({ ready: true });
  } catch (error) {
    log.finish(error instanceof ZodError ? 'rejected' : 'failed', error);
    throw error;
  }
});

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
  const log = createTransferLog('export', c.get('requestId'));
  try {
    const format = formatQuerySchema.parse(c.req.query('format'));
    if (format === 'auto') {
      log.finish('rejected');
      return jsonError(c, 400, 'validation_error', '导出不支持自动识别，请指定 html 或 json');
    }
    const body = await exportTransferStream(c.get('db'), format, log);
    return new Response(body, {
      headers: {
        'Content-Type': `${format === 'json' ? 'application/json' : 'text/html'}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="nav-export-${timestampForFilename()}.${format}"`,
      },
    });
  } catch (error) {
    log.finish(error instanceof ZodError ? 'rejected' : 'failed', error);
    throw error;
  }
});

transferRoutes.post('/import', async (c) => {
  const log = createTransferLog('import', c.get('requestId'));
  let writing = false;
  try {
    const requestedFormat = formatQuerySchema.parse(c.req.query('format'));
    const strategy: ImportStrategy = strategyQuerySchema.parse(c.req.query('strategy'));
    const body = await readImportBody(c.req.raw);
    if (body === null) {
      log.finish('rejected');
      return jsonError(c, 413, 'too_large', `文件过大（超过 ${MAX_IMPORT_BYTES / 1024 / 1024}MB）`);
    }
    log.phase('parse');
    let format: 'html' | 'json';
    try {
      format =
        requestedFormat === 'auto'
          ? detectFormat(filenameFromContentType(c.req.header('Content-Type') ?? ''), body)
          : requestedFormat;
    } catch (error) {
      log.finish('rejected', error);
      return jsonError(
        c,
        400,
        'validation_error',
        error instanceof Error ? error.message : '无法识别文件格式',
      );
    }
    log.format(format);
    let data: TransferData;
    try {
      data = format === 'json' ? parseJson(body) : parseHtml(body);
    } catch (error) {
      log.finish('rejected', error);
      return jsonError(
        c,
        400,
        'validation_error',
        error instanceof Error ? error.message : '解析失败',
      );
    }
    writing = true;
    const summary = await importTransferData(c.get('db'), data, strategy, log);
    log.finish('success');
    return c.json(summary, 200);
  } catch (error) {
    log.finish(
      error instanceof ServiceError || error instanceof ZodError ? 'rejected' : 'failed',
      error,
    );
    if (error instanceof ServiceError) return handleServiceError(c, error);
    if (writing) return jsonError(c, 500, 'internal_error', '数据库写入失败，请查看 Worker 日志');
    throw error;
  }
});

export default transferRoutes;
