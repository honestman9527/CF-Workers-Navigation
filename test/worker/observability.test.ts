import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import app from '../../src/worker/app';
import { createTransferLog, safeFailure } from '../../src/worker/observability';
import { createBookmark } from '../../src/worker/services/bookmarks';
import { exportTransferStream } from '../../src/worker/services/transfer-export';

const db = drizzle(env.DB);
const headers = { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' };

beforeEach(async () => {
  await env.DB.batch(
    ['bookmark_tags', 'bookmarks', 'tags', 'categories'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

it('logs completed import counts, stages and request correlation without backup contents', async () => {
  const infoLog = vi.spyOn(console, 'info').mockImplementation(() => {});
  const response = await app.fetch(
    new Request('https://example.com/api/v1/transfer/import?format=json', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        version: 2,
        bookmarks: [
          { title: 'private title', url: 'https://private.example.com', tags: ['private tag'] },
        ],
      }),
    }),
    env,
  );
  expect(response.status).toBe(200);
  const entries = infoLog.mock.calls.map(([entry]) => entry);
  expect(entries.map((entry) => entry.phase)).toEqual(
    expect.arrayContaining(['parse', 'match', 'categories', 'insert-bookmarks', 'tags']),
  );
  expect(entries.at(-1)).toMatchObject({
    event: 'transfer',
    operation: 'import',
    outcome: 'success',
    format: 'json',
    durationMs: expect.any(Number),
    counts: { bookmarksCreated: 1, bookmarksSkipped: 0 },
  });
  expect(new Set(entries.map((entry) => entry.requestId)).size).toBe(1);
  expect(JSON.stringify(entries)).not.toMatch(
    /private title|private\.example|private tag|dev-password/,
  );
});

it.each(['json', 'html'] as const)(
  'logs %s success only after consuming the entire stream',
  async (format) => {
    const infoLog = vi.spyOn(console, 'info').mockImplementation(() => {});
    await createBookmark(db, { title: 'private title', url: 'https://private.example.com' });
    const stream = await exportTransferStream(db, format, createTransferLog('export', 'consumed'));
    expect(infoLog.mock.calls.some(([entry]) => entry.outcome === 'success')).toBe(false);
    await new Response(stream).text();
    const terminal = infoLog.mock.calls
      .map(([entry]) => entry)
      .filter((entry) => entry.outcome !== 'running');
    expect(terminal).toEqual([
      expect.objectContaining({
        requestId: 'consumed',
        operation: 'export',
        format,
        outcome: 'success',
        counts: { categoriesRead: 0, bookmarksRead: 1 },
      }),
    ]);
    expect(JSON.stringify(terminal)).not.toMatch(/private title|private\.example/);
  },
);

it('records cancellation once and never reports a cancelled download as successful', async () => {
  const infoLog = vi.spyOn(console, 'info').mockImplementation(() => {});
  const stream = await exportTransferStream(db, 'json', createTransferLog('export', 'cancelled'));
  const reader = stream.getReader();
  await reader.read();
  await reader.cancel();
  const outcomes = infoLog.mock.calls
    .map(([entry]) => entry.outcome)
    .filter((outcome) => outcome !== 'running');
  expect(outcomes).toEqual(['cancelled']);
});

it('records invalid backup rejection without logging its text', async () => {
  const infoLog = vi.spyOn(console, 'info').mockImplementation(() => {});
  const response = await app.fetch(
    new Request('https://example.com/api/v1/transfer/import?format=json', {
      method: 'POST',
      headers,
      body: 'private-backup-syntax',
    }),
    env,
  );
  expect(response.status).toBe(400);
  expect(infoLog).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: 'rejected', phase: 'parse' }),
  );
  expect(JSON.stringify(infoLog.mock.calls)).not.toContain('private-backup-syntax');
});

it('does not extract private SQL parameters as diagnostic codes', () => {
  expect(
    safeFailure(new Error('Failed query: insert into bookmarks; params: SQLITE_PRIVATE_TITLE')),
  ).toEqual({ type: 'Error' });
});
