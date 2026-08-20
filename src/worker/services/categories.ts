import type { Category as CategoryDto, CategoryInput } from '../../shared/api/types';
import type { Db } from '../types';

import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { UNCATEGORIZED_SLUG } from '../../shared/api/types';
import { bookmarks, categories } from '../schema';
import { slugify } from '../slug';
import { ServiceError } from './errors';

type CategoryRow = {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  bookmark_count: number;
};

function toDto(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    sortOrder: row.sort_order,
    bookmarkCount: Number(row.bookmark_count),
  };
}

export type CategoryWrite = {
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

function categorySelect() {
  return sql`
    SELECT c.id, c.parent_id, c.name, c.slug, c.icon, c.sort_order,
      COUNT(CASE WHEN b.id IS NOT NULL AND b.deleted_at IS NULL AND b.archived_at IS NULL THEN 1 END) AS bookmark_count
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

export async function listCategories(db: Db): Promise<CategoryDto[]> {
  const rows = await db.all<CategoryRow>(sql`
    ${categorySelect()}
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

export async function createCategory(db: Db, input: CategoryInput): Promise<CategoryDto> {
  const name = normalizeName(input.name, '分类名称');
  const slug = slugify(name);
  if (input.parentId !== undefined && input.parentId !== null) {
    await assertCategoryExists(db, input.parentId);
  }
  const parentId = input.parentId ?? null;

  const [duplicate] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug));
  if (duplicate) throw new ServiceError(409, 'conflict', '同名分类已存在');

  const siblings = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId));
  const sortOrder =
    siblings.length === 0 ? 0 : Math.max(...siblings.map((row) => row.sortOrder)) + 1;

  const [created] = await db
    .insert(categories)
    .values({ name, slug, parentId, icon: input.icon ?? null, sortOrder })
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
    .select({ id: categories.id, slug: categories.slug, parentId: categories.parentId })
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
    if (targetParent !== null) {
      if (targetParent === id) {
        throw new ServiceError(400, 'validation_error', '不能移动到自身内部');
      }
      await assertCategoryExists(db, targetParent);
      if (await isSelfOrAncestor(db, id, targetParent)) {
        throw new ServiceError(400, 'validation_error', '不能移动到自己的子分类内部');
      }
    }
    updates.parentId = targetParent;
  }

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
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.id, id));
  if (!current) throw new ServiceError(404, 'not_found', '分类不存在');

  // 子分类上移一级，书签改为未分类（不依赖外键动作，避免部分环境外键为 NO ACTION 时报错）。
  await db
    .update(categories)
    .set({ parentId: current.parentId, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(categories.parentId, id));
  await db.update(bookmarks).set({ categoryId: null }).where(eq(bookmarks.categoryId, id));
  await db.delete(categories).where(eq(categories.id, id));
}

export async function reorderCategories(db: Db, ids: number[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new ServiceError(400, 'validation_error', '至少需要一个分类');
  if (unique.length > 500) {
    throw new ServiceError(400, 'validation_error', '一次最多排序 500 个分类');
  }

  const rows = await db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)
    .where(inArray(categories.id, unique));
  if (rows.length !== unique.length) {
    throw new ServiceError(404, 'not_found', '某些分类不存在');
  }
  const parents = new Set(rows.map((row) => row.parentId ?? null));
  if (parents.size > 1) throw new ServiceError(400, 'validation_error', '只能对同一层级分类排序');

  const statements = unique.map((id, index) =>
    db
      .update(categories)
      .set({ sortOrder: index, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(categories.id, id)),
  );
  await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
}
