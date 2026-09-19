import type { Tag as TagDto } from '../../shared/api/types';
import type { Db } from '../types';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { bookmarkTags, tags } from '../schema';
import { slugify } from '../slug';
import { publicBookmarkCondition } from '../visibility';
import { ServiceError } from './errors';

type TagRow = {
  id: number;
  name: string;
  slug: string;
  bookmark_count: number;
};

function toDto(row: TagRow): TagDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    bookmarkCount: Number(row.bookmark_count),
  };
}

export type TagInput = { name: string };

function normalizeName(input: string | undefined): string {
  if (input === undefined) throw new ServiceError(400, 'validation_error', '标签名称不能为空');
  const name = input.trim();
  if (!name) throw new ServiceError(400, 'validation_error', '标签名称不能为空');
  const slug = slugify(name);
  if (!slug) throw new ServiceError(400, 'validation_error', '标签名称需包含字母、数字或中文');
  return name;
}

function tagSelect(authed = true) {
  return sql`
    SELECT t.id, t.name, t.slug,
      COUNT(CASE WHEN b.id IS NOT NULL AND b.deleted_at IS NULL AND b.archived_at IS NULL ${authed ? sql`` : sql`AND ${publicBookmarkCondition}`} THEN 1 END) AS bookmark_count
    FROM tags t
    LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
    LEFT JOIN bookmarks b ON b.id = bt.bookmark_id
  `;
}

async function getTagDto(db: Db, id: number): Promise<TagDto> {
  const [row] = await db.all<TagRow>(sql`
    ${tagSelect()}
    WHERE t.id = ${id}
    GROUP BY t.id
  `);
  if (!row) throw new ServiceError(404, 'not_found', '标签不存在');
  return toDto(row);
}

export async function listTags(db: Db, authed: boolean): Promise<TagDto[]> {
  const rows = await db.all<TagRow>(sql`
    ${tagSelect(authed)}
    GROUP BY t.id
    ${authed ? sql`` : sql`HAVING bookmark_count > 0`}
    ORDER BY t.name COLLATE NOCASE, t.id
  `);
  return rows.map(toDto);
}

export async function createTag(db: Db, input: TagInput): Promise<TagDto> {
  const name = normalizeName(input.name);
  const slug = slugify(name);
  const [duplicate] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug));
  if (duplicate) throw new ServiceError(409, 'conflict', '同名标签已存在');

  const [created] = await db.insert(tags).values({ name, slug }).returning({ id: tags.id });
  return getTagDto(db, created.id);
}

export async function updateTag(db: Db, id: number, input: TagInput): Promise<TagDto> {
  const [current] = await db
    .select({ id: tags.id, slug: tags.slug })
    .from(tags)
    .where(eq(tags.id, id));
  if (!current) throw new ServiceError(404, 'not_found', '标签不存在');

  const name = normalizeName(input.name);
  const slug = slugify(name);
  if (slug !== current.slug) {
    const [duplicate] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.slug, slug), ne(tags.id, id)));
    if (duplicate) throw new ServiceError(409, 'conflict', '同名标签已存在');
  }

  await db.update(tags).set({ name, slug }).where(eq(tags.id, id));
  return getTagDto(db, id);
}

/** 把 source 标签合并进 target：书签关联改指 target（去重）后删除 source。 */
export async function mergeTag(db: Db, sourceId: number, targetId: number): Promise<TagDto> {
  if (sourceId === targetId) {
    throw new ServiceError(400, 'validation_error', '不能把标签合并到自身');
  }
  const found = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.id, [sourceId, targetId]));
  if (found.length !== 2) throw new ServiceError(404, 'not_found', '标签不存在');

  await db.run(sql`
    INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id)
    SELECT bookmark_id, ${targetId} FROM bookmark_tags WHERE tag_id = ${sourceId}
  `);
  await db.delete(bookmarkTags).where(eq(bookmarkTags.tagId, sourceId));
  await db.delete(tags).where(eq(tags.id, sourceId));
  return getTagDto(db, targetId);
}

export async function deleteTag(db: Db, id: number): Promise<void> {
  const [target] = await db.select({ id: tags.id }).from(tags).where(eq(tags.id, id));
  if (!target) throw new ServiceError(404, 'not_found', '标签不存在');

  // 手动清理关联，避免依赖部分环境外键动作。
  await db.delete(bookmarkTags).where(eq(bookmarkTags.tagId, id));
  await db.delete(tags).where(eq(tags.id, id));
}
