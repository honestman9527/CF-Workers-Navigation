import type { Bookmark, Tag } from '../src/shared/api/types';

import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const API = 'https://example.com/api/v1';
const adminHeaders = { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' };

async function createTag(name: string): Promise<Tag> {
  const response = await exports.default.fetch(`${API}/tags`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
  return response.json<Tag>();
}

async function createBookmark(input: Record<string, unknown>): Promise<Bookmark> {
  const response = await exports.default.fetch(`${API}/bookmarks`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return response.json<Bookmark>();
}

async function listTags(): Promise<Tag[]> {
  const response = await exports.default.fetch(`${API}/tags`, { headers: adminHeaders });
  expect(response.status).toBe(200);
  return response.json<Tag[]>();
}

describe('tags api', () => {
  it('requires auth for tag management', async () => {
    const responses = await Promise.all([
      exports.default.fetch(`${API}/tags`),
      exports.default.fetch(`${API}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' }),
      }),
      exports.default.fetch(`${API}/tags/1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' }),
      }),
      exports.default.fetch(`${API}/tags/1`, { method: 'DELETE' }),
      exports.default.fetch(`${API}/tags/1/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: 2 }),
      }),
    ]);
    expect(responses.every((response) => response.status === 401)).toBe(true);
  });

  it('creates tags and lists them with active bookmark counts', async () => {
    const created = await createTag('开发工具');
    expect(created.name).toBe('开发工具');
    expect(created.slug).toBe('开发工具');
    expect(created.bookmarkCount).toBe(0);

    const tagged = await createBookmark({
      title: 'Tagged page',
      url: 'https://tag-count.example.com',
      tags: ['开发工具'],
    });
    const archived = await createBookmark({
      title: 'Archived page',
      url: 'https://tag-count-archived.example.com',
      tags: ['开发工具'],
    });
    await exports.default.fetch(`${API}/bookmarks/${archived.id}/archive`, {
      method: 'POST',
      headers: adminHeaders,
    });

    const tags = await listTags();
    const match = tags.find((tag) => tag.id === created.id);
    expect(match?.bookmarkCount).toBe(1);
    expect(tagged.id).toBeGreaterThan(0);
  });

  it('rejects duplicate names, empty names, and reserved-looking input', async () => {
    await createTag('唯一标签');
    const duplicate = await exports.default.fetch(`${API}/tags`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: '唯一标签' }),
    });
    expect(duplicate.status).toBe(409);

    const empty = await exports.default.fetch(`${API}/tags`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: '   ' }),
    });
    expect(empty.status).toBe(400);

    const malformed = await exports.default.fetch(`${API}/tags`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({}),
    });
    expect(malformed.status).toBe(400);
  });

  it('renames a tag and rejects slug conflicts', async () => {
    const original = await createTag('改名标签');
    const renamed = await exports.default.fetch(`${API}/tags/${original.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ name: '改名标签2' }),
    });
    expect(renamed.status).toBe(200);
    const renamedBody = await renamed.json<Tag>();
    expect(renamedBody.name).toBe('改名标签2');
    expect(renamedBody.slug).toBe('改名标签2');

    await createTag('冲突目标');
    const conflict = await exports.default.fetch(`${API}/tags/${original.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ name: '冲突目标' }),
    });
    expect(conflict.status).toBe(409);

    const missing = await exports.default.fetch(`${API}/tags/999999`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ name: '不存在' }),
    });
    expect(missing.status).toBe(404);
  });

  it('merges one tag into another and reassigns bookmark associations', async () => {
    const source = await createTag('合并源');
    const target = await createTag('合并目标');
    const bookmarkA = await createBookmark({
      title: 'Source A',
      url: 'https://merge-a.example.com',
      tags: ['合并源'],
    });
    await createBookmark({
      title: 'Source B',
      url: 'https://merge-b.example.com',
      tags: ['合并源'],
    });
    await createBookmark({
      title: 'Target C',
      url: 'https://merge-c.example.com',
      tags: ['合并目标'],
    });

    const response = await exports.default.fetch(`${API}/tags/${source.id}/merge`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ targetId: target.id }),
    });
    expect(response.status).toBe(200);
    const merged = await response.json<Tag>();
    expect(merged.id).toBe(target.id);
    expect(merged.bookmarkCount).toBe(3);

    const tags = await listTags();
    expect(tags.find((tag) => tag.id === source.id)).toBeUndefined();

    // 源书签的标签已改指目标。
    const detail = await exports.default.fetch(`${API}/bookmarks/${bookmarkA.id}`, {
      headers: adminHeaders,
    });
    const detailBody = await detail.json<Bookmark>();
    expect(detailBody.tags).toContain('合并目标');
    expect(detailBody.tags).not.toContain('合并源');
  });

  it('rejects self-merge and missing targets', async () => {
    const solo = await createTag('孤立标签');
    const selfMerge = await exports.default.fetch(`${API}/tags/${solo.id}/merge`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ targetId: solo.id }),
    });
    expect(selfMerge.status).toBe(400);

    const missingTarget = await exports.default.fetch(`${API}/tags/${solo.id}/merge`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ targetId: 999999 }),
    });
    expect(missingTarget.status).toBe(404);
  });

  it('deletes a tag and clears its bookmark associations', async () => {
    const doomed = await createTag('待删除标签');
    await createBookmark({
      title: 'Doomed tagged',
      url: 'https://delete-tag.example.com',
      tags: ['待删除标签'],
    });

    const deleted = await exports.default.fetch(`${API}/tags/${doomed.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    expect(deleted.status).toBe(204);

    const tags = await listTags();
    expect(tags.find((tag) => tag.id === doomed.id)).toBeUndefined();

    const missing = await exports.default.fetch(`${API}/tags/${doomed.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    expect(missing.status).toBe(404);
  });
});
