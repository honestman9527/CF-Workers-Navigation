import type { CategorySystemKey, Visibility } from '../../shared/api/types';
import type { Category as CategoryDto, CategoryInput } from '../../shared/api/types';
import type { Db } from '../types';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { UNCATEGORIZED_SLUG } from '../../shared/api/types';
import { CATEGORY_DEPTH_MESSAGE, SYSTEM_CATEGORY_MESSAGE } from '../../shared/category-rules';
import { bookmarks, categories } from '../schema';
import { getDefaultVisibility } from '../settings';
import { slugify } from '../slug';
import {
  publicBookmarkCondition,
  privateCategoryIds,
  categoryEffectiveVisibility,
} from '../visibility';
import { ServiceError } from './errors';

// 每条 CASE WHEN 批量排序语句绑定 30 * 3 = 90 个参数（低于 D1 100 参数硬上限）。
const REORDER_CHUNK_SIZE = 30;

type CategoryRow = {
  visibility: Visibility;
  effective_visibility: Visibility;
  id: number;
  parent_id: number | null;
  system_key: CategorySystemKey | null;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  bookmark_count: number;
};

function toDto(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    visibility: row.visibility,
    effectiveVisibility: row.effective_visibility,
    parentId: row.parent_id,
    systemKey: row.system_key,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    sortOrder: row.sort_order,
    bookmarkCount: Number(row.bookmark_count),
  };
}

export type CategoryWrite = {
  visibility?: Visibility;
  name?: string;
  parentId?: number | null;
  icon?: string | null;
};

function assertReservedSlug(slug: string): void {
  if (slug === UNCATEGORIZED_SLUG) {
    throw new ServiceError(400, 'validation_error', '该名称已被保留，无法使用');
  }
}

function normalizeName(input: string | undefined, label: string): string {
  if (input === undefined) throw new ServiceError(400, 'validation_error', `${label}不能为空`);
  const name = input.trim();
  if (!name) throw new ServiceError(400, 'validation_error', `${label}不能为空`);
  const slug = slugify(name);
  if (!slug) throw new ServiceError(400, 'validation_error', `${label}需包含字母、数字或中文`);
  assertReservedSlug(slug);
  return name;
}

function categorySelect(authed = true) {
  return sql`
    SELECT c.visibility, ${categoryEffectiveVisibility} AS effective_visibility, c.id, c.parent_id, c.system_key, c.name, c.slug, c.icon, c.sort_order,
      COUNT(CASE WHEN b.id IS NOT NULL AND b.deleted_at IS NULL AND b.archived_at IS NULL ${authed ? sql`` : sql`AND ${publicBookmarkCondition}`} THEN 1 END) AS bookmark_count
    FROM categories c
    LEFT JOIN bookmarks b ON b.category_id = c.id
  `;
}

async function getCategoryDto(db: Db, id: number): Promise<CategoryDto> {
  const [row] = await db.all<CategoryRow>(sql`
    ${categorySelect()}
    WHERE c.id = ${id}
    GROUP BY c.id
  `);
  if (!row) throw new ServiceError(404, 'not_found', '分类不存在');
  return toDto(row);
}

export async function listCategories(db: Db, authed: boolean): Promise<CategoryDto[]> {
  const rows = await db.all<CategoryRow>(sql`
    ${categorySelect(authed)}
    ${authed ? sql`` : sql`WHERE c.id NOT IN ${privateCategoryIds}`}
    GROUP BY c.id
    ORDER BY c.sort_order, c.name COLLATE NOCASE, c.id
  `);
  return rows.map(toDto);
}

export async function assertCategoryExists(db: Db, id: number): Promise<void> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, id));
  if (!row) throw new ServiceError(404, 'not_found', '分类不存在');
}

async function assertRootParent(db: Db, parentId: number, movingId?: number): Promise<void> {
  const [parent] = await db
    .select({ parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.id, parentId));
  if (!parent) throw new ServiceError(404, 'not_found', '分类不存在');
  if (movingId !== undefined && parent.parentId === movingId) {
    throw new ServiceError(400, 'validation_error', '不能移动到自己的子分类内部');
  }
  if (parent.parentId !== null) {
    if (movingId !== undefined && (await isSelfOrAncestor(db, movingId, parent.parentId))) {
      throw new ServiceError(400, 'validation_error', '不能移动到自己的子分类内部');
    }
    throw new ServiceError(400, 'validation_error', CATEGORY_DEPTH_MESSAGE);
  }
  if (movingId !== undefined) {
    const children = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, movingId))
      .limit(1);
    if (children.length) {
      throw new ServiceError(400, 'validation_error', CATEGORY_DEPTH_MESSAGE);
    }
  }
}

export async function createCategory(db: Db, input: CategoryInput): Promise<CategoryDto> {
  const name = normalizeName(input.name, '分类名称');
  const slug = slugify(name);
  if (input.parentId !== undefined && input.parentId !== null) {
    await assertRootParent(db, input.parentId);
  }
  const parentId = input.parentId ?? null;

  const [duplicate] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug));
  if (duplicate) throw new ServiceError(409, 'conflict', '同名分类已存在');

  const [orderRow] = await db.all<{ next_order: number }>(sql`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
    FROM categories
    WHERE ${parentId === null ? sql`parent_id IS NULL` : sql`parent_id = ${parentId}`}
  `);
  const sortOrder = Number(orderRow?.next_order ?? 0);

  const [created] = await db
    .insert(categories)
    .values({
      name,
      slug,
      parentId,
      icon: input.icon ?? null,
      sortOrder,
      visibility:
        input.visibility ?? (await getDefaultVisibility(db, 'default_category_visibility')),
    })
    .returning({ id: categories.id });
  return getCategoryDto(db, created.id);
}

/** 从 startId 沿 parentId 上溯，判断 nodeId 是否在祖先链上（含自身），用于循环检测。 */
async function isSelfOrAncestor(db: Db, nodeId: number, startId: number): Promise<boolean> {
  let current: number | null = startId;
  const seen = new Set<number>();
  while (current !== null && !seen.has(current)) {
    if (current === nodeId) return true;
    seen.add(current);
    const [row] = await db
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, current));
    current = row?.parentId ?? null;
  }
  return false;
}

export async function updateCategory(
  db: Db,
  id: number,
  input: CategoryWrite,
): Promise<CategoryDto> {
  const [current] = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      parentId: categories.parentId,
      systemKey: categories.systemKey,
    })
    .from(categories)
    .where(eq(categories.id, id));
  if (!current) throw new ServiceError(404, 'not_found', '分类不存在');

  const updates: Partial<typeof categories.$inferInsert> = {};

  if (input.name !== undefined) {
    const name = normalizeName(input.name, '分类名称');
    const slug = slugify(name);
    if (slug !== current.slug) {
      const [duplicate] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.slug, slug), ne(categories.id, id)));
      if (duplicate) throw new ServiceError(409, 'conflict', '同名分类已存在');
    }
    updates.name = name;
    updates.slug = slug;
  }

  if (input.parentId !== undefined) {
    const targetParent = input.parentId;
    if (current.systemKey !== null && targetParent !== null) {
      throw new ServiceError(400, 'validation_error', SYSTEM_CATEGORY_MESSAGE);
    }
    if (targetParent !== null) {
      if (targetParent === id) {
        throw new ServiceError(400, 'validation_error', '不能移动到自身内部');
      }
      await assertRootParent(db, targetParent, id);
    }
    updates.parentId = targetParent;
  }

  if (input.visibility !== undefined) updates.visibility = input.visibility;

  if (input.icon !== undefined) {
    updates.icon = input.icon;
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(categories)
      .set({ ...updates, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(categories.id, id));
  }

  return getCategoryDto(db, id);
}

export async function deleteCategory(db: Db, id: number): Promise<void> {
  const [current] = await db
    .select({ id: categories.id, systemKey: categories.systemKey })
    .from(categories)
    .where(eq(categories.id, id));
  if (!current) throw new ServiceError(404, 'not_found', '分类不存在');
  if (current.systemKey !== null) {
    throw new ServiceError(400, 'validation_error', SYSTEM_CATEGORY_MESSAGE);
  }

  // 在删除分类前的单次原子批次内：上移子分类并固化私有权限；与未分类 URL 冲突的书签软删进回收站；其余书签转入未分类并顺接排序。
  await db.batch([
    db
      .update(categories)
      .set({
        parentId: sql`(SELECT parent_id FROM categories WHERE id = ${id})`,
        visibility: sql`CASE WHEN ${categories.id} IN ${privateCategoryIds} THEN 'private' ELSE ${categories.visibility} END`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(categories.parentId, id)),
    db.update(bookmarks).set({
      categoryId: null,
      deletedAt: sql`CURRENT_TIMESTAMP`,
      visibility: sql`CASE WHEN ${bookmarks.categoryId} IN ${privateCategoryIds} THEN 'private' ELSE ${bookmarks.visibility} END`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(sql`
        ${bookmarks.categoryId} = ${id}
        AND ${bookmarks.deletedAt} IS NULL
        AND EXISTS (
          SELECT 1 FROM bookmarks uncat
          WHERE uncat.category_id IS NULL
            AND uncat.deleted_at IS NULL
            AND uncat.url_normalized = ${bookmarks.urlNormalized}
        )
      `),
    db
      .update(bookmarks)
      .set({
        categoryId: null,
        sortOrder: sql`${bookmarks.sortOrder} + COALESCE((SELECT MAX(sort_order) + 1 FROM bookmarks WHERE category_id IS NULL), 0)`,
        visibility: sql`CASE WHEN ${bookmarks.categoryId} IN ${privateCategoryIds} THEN 'private' ELSE ${bookmarks.visibility} END`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(bookmarks.categoryId, id)),
    db.delete(categories).where(eq(categories.id, id)),
  ]);
}

export async function reorderCategories(db: Db, ids: number[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new ServiceError(400, 'validation_error', '至少需要一个分类');
  if (unique.length > 500) {
    throw new ServiceError(400, 'validation_error', '一次最多排序 500 个分类');
  }

  const rows: Array<{ id: number; parentId: number | null }> = [];
  for (let index = 0; index < unique.length; index += 100) {
    rows.push(
      ...(await db
        .select({ id: categories.id, parentId: categories.parentId })
        .from(categories)
        .where(inArray(categories.id, unique.slice(index, index + 100)))),
    );
  }
  if (rows.length !== unique.length) {
    throw new ServiceError(404, 'not_found', '某些分类不存在');
  }
  const parents = new Set(rows.map((row) => row.parentId ?? null));
  if (parents.size > 1) throw new ServiceError(400, 'validation_error', '只能对同一层级分类排序');

  const statements = [];
  for (let start = 0; start < unique.length; start += REORDER_CHUNK_SIZE) {
    const chunk = unique.slice(start, start + REORDER_CHUNK_SIZE);
    const cases = chunk.map((id, offset) => sql`WHEN ${id} THEN ${start + offset}`);
    statements.push(
      db
        .update(categories)
        .set({
          sortOrder: sql`CASE ${categories.id} ${sql.join(cases, sql` `)} END`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(inArray(categories.id, chunk)),
    );
  }
  await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
}
