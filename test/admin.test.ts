import type { AdminStats } from '../src/shared/api/types';

import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const API = 'https://example.com/api/v1';
const adminHeaders = { Authorization: 'Bearer dev-password', 'Content-Type': 'application/json' };

describe('admin api', () => {
  it('requires auth for overview stats', async () => {
    const response = await exports.default.fetch(`${API}/admin/stats`);
    expect(response.status).toBe(401);
  });

  it('reports accurate overview counts across bookmark states', async () => {
    const createBookmark = async (input: Record<string, unknown>) => {
      const response = await exports.default.fetch(`${API}/bookmarks`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(201);
      return response.json<{ id: number }>();
    };

    const category = await (
      await exports.default.fetch(`${API}/categories`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ name: '统计分类' }),
      })
    ).json<{ id: number }>();

    const tag = await (
      await exports.default.fetch(`${API}/tags`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ name: '统计标签' }),
      })
    ).json<{ id: number }>();

    const active = await createBookmark({
      title: 'Active',
      url: 'https://stats-active.example.com',
      categoryId: category.id,
    });
    await createBookmark({ title: 'Plain', url: 'https://stats-plain.example.com' });
    const archived = await createBookmark({
      title: 'Archived',
      url: 'https://stats-archived.example.com',
    });
    const trash = await createBookmark({ title: 'Trash', url: 'https://stats-trash.example.com' });

    await exports.default.fetch(`${API}/bookmarks/${archived.id}/archive`, {
      method: 'POST',
      headers: adminHeaders,
    });
    await exports.default.fetch(`${API}/bookmarks/${trash.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });

    const response = await exports.default.fetch(`${API}/admin/stats`, {
      headers: adminHeaders,
    });
    expect(response.status).toBe(200);
    const stats = await response.json<AdminStats>();

    expect(stats.bookmarks.total).toBe(4);
    expect(stats.bookmarks.active).toBe(2);
    expect(stats.bookmarks.archived).toBe(1);
    expect(stats.bookmarks.trash).toBe(1);
    expect(stats.categories).toBe(1);
    expect(stats.tags).toBe(1);
    expect(active.id).toBeGreaterThan(0);
    expect(tag.id).toBeGreaterThan(0);
  });
});
