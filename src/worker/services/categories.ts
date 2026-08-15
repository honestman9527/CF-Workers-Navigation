import type { CategoryNode } from '../../shared/api/types';
import type { Bindings } from '../types';

import { eq, inArray, sql } from 'drizzle-orm';

import { getDb } from '../db';
import { categories, type Category } from '../schema';
import { uniqueSlug } from '../slug';
import { ServiceError } from './errors';

type CategoryRow = {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type BookmarkCountRow = {
  category_id: number;
  count: number;
};

export type CategoryWrite = {
  name: string;
  parentId?: number | null;
  icon?: string | null;
  sortOrder?: number;
};

export function toCategoryDto(
  row: Category,
): Omit<CategoryNode, 'bookmarkCount' | 'totalBookmarkCount' | 'children'> {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function categoryExists(env: Bindings, id: number) {
  const db = getDb(env);
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, id));
  return category !== undefined;
}

async function isDescendant(env: Bindings, id: number, maybeDescendantId: number) {
  const db = getDb(env);
  const descendant = await db.get<{ id: number }>(sql`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM categories WHERE parent_id = ${id}
      UNION ALL
      SELECT categories.id FROM categories JOIN descendants ON categories.parent_id = descendants.id
    )
    SELECT id FROM descendants WHERE id = ${maybeDescendantId} LIMIT 1
  `);

  return descendant !== undefined;
}

function sortTree(nodes: CategoryNode[]) {
  nodes.sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  for (const node of nodes) {
    sortTree(node.children);
  }
}

function sumBookmarkCounts(node: CategoryNode): number {
  node.totalBookmarkCount =
    node.bookmarkCount +
    node.children.reduce((total, child) => total + sumBookmarkCounts(child), 0);
  return node.totalBookmarkCount;
}

export async function listCategoryTree(env: Bindings): Promise<CategoryNode[]> {
  const db = getDb(env);
  const [rows, countRows] = await Promise.all([
    db.all<CategoryRow>(sql`
      SELECT id, parent_id, name, slug, icon, sort_order, created_at, updated_at
      FROM categories
    `),
    db.all<BookmarkCountRow>(sql`
      SELECT category_id, COUNT(*) AS count
      FROM bookmarks
      GROUP BY category_id
    `),
  ]);

  const bookmarkCounts = new Map(countRows.map((row) => [row.category_id, row.count]));
  const nodes = new Map<number, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      bookmarkCount: bookmarkCounts.get(row.id) ?? 0,
      totalBookmarkCount: 0,
      children: [],
    });
  }

  for (const node of nodes.values()) {
    if (node.parentId === null) {
      roots.push(node);
      continue;
    }
    nodes.get(node.parentId)?.children.push(node);
  }

  sortTree(roots);
  for (const root of roots) {
    sumBookmarkCounts(root);
  }

  return roots;
}

export async function createCategory(env: Bindings, input: CategoryWrite): Promise<Category> {
  if (
    input.parentId !== undefined &&
    input.parentId !== null &&
    !(await categoryExists(env, input.parentId))
  ) {
    throw new ServiceError(404, 'not_found', 'Parent category not found');
  }

  const db = getDb(env);
  const existing = await db.select({ slug: categories.slug }).from(categories);
  const slug = uniqueSlug(input.name, new Set(existing.map((row) => row.slug)));

  const [category] = await db
    .insert(categories)
    .values({
      name: input.name,
      slug,
      parentId: input.parentId,
      icon: input.icon,
      sortOrder: input.sortOrder,
    })
    .returning();

  return category;
}

export async function updateCategory(
  env: Bindings,
  id: number,
  input: Partial<CategoryWrite>,
): Promise<Category> {
  const db = getDb(env);
  const [current] = await db.select().from(categories).where(eq(categories.id, id));
  if (current === undefined) {
    throw new ServiceError(404, 'not_found', 'Category not found');
  }

  if (input.parentId !== undefined) {
    if (input.parentId === id) {
      throw new ServiceError(400, 'validation_error', 'Category cannot be its own parent');
    }

    if (input.parentId !== null) {
      if (!(await categoryExists(env, input.parentId))) {
        throw new ServiceError(404, 'not_found', 'Parent category not found');
      }
      if (await isDescendant(env, id, input.parentId)) {
        throw new ServiceError(
          400,
          'validation_error',
          'Category cannot move under its descendant',
        );
      }
    }
  }

  const [category] = await db
    .update(categories)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(categories.id, id))
    .returning();

  return category;
}

export async function deleteCategory(env: Bindings, id: number): Promise<void> {
  const db = getDb(env);
  const deleted = await db
    .delete(categories)
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  if (deleted.length === 0) {
    throw new ServiceError(404, 'not_found', 'Category not found');
  }
}

export async function reorderCategories(
  env: Bindings,
  items: Array<{ id: number; sortOrder: number }>,
): Promise<void> {
  const db = getDb(env);
  const ids = items.map((item) => item.id);
  const existing = await db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)
    .where(inArray(categories.id, ids));

  if (existing.length !== ids.length) {
    throw new ServiceError(404, 'not_found', 'Category not found');
  }

  const [first] = existing;
  if (existing.some((category) => category.parentId !== first.parentId)) {
    throw new ServiceError(400, 'validation_error', 'Categories must share the same parent');
  }

  const updates = items.map((item) =>
    db
      .update(categories)
      .set({ sortOrder: item.sortOrder, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(categories.id, item.id)),
  );
  await db.batch(updates as [(typeof updates)[number], ...typeof updates]);
}
