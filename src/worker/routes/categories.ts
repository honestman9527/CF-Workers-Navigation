import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import { jsonError } from '../errors';
import { parseJson } from '../http';
import {
  createCategory,
  deleteCategory,
  listCategoryTree,
  reorderCategories,
  toCategoryDto,
  updateCategory,
} from '../services/categories';
import { ServiceError } from '../services/errors';

const categoryInputSchema = z.object({
  name: z.string().trim().min(1),
  parentId: z.number().int().positive().nullable().optional(),
  icon: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const categoryUpdateSchema = categoryInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const reorderSchema = z.object({
  items: z
    .array(z.object({ id: z.number().int().positive(), sortOrder: z.number().int() }))
    .min(1)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
      message: 'Category ids must be unique',
    }),
});

const idParamSchema = z.coerce.number().int().positive();
const categoriesRoutes = new Hono<AppEnv>();

function handleServiceError(c: Parameters<typeof jsonError>[0], error: unknown) {
  if (error instanceof ServiceError) {
    return jsonError(c, error.status, error.code, error.message);
  }
  throw error;
}

categoriesRoutes.get('/', async (c) => {
  return c.json(await listCategoryTree(c.env));
});

categoriesRoutes.post('/', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) {
    return body.response;
  }

  try {
    const category = await createCategory(c.env, categoryInputSchema.parse(body.body));
    return c.json(toCategoryDto(category), 201);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

categoriesRoutes.put('/:id', async (c) => {
  const id = idParamSchema.parse(c.req.param('id'));
  const body = await parseJson(c);
  if (!body.ok) {
    return body.response;
  }

  try {
    const category = await updateCategory(c.env, id, categoryUpdateSchema.parse(body.body));
    return c.json(toCategoryDto(category));
  } catch (error) {
    return handleServiceError(c, error);
  }
});

categoriesRoutes.patch('/reorder', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) {
    return body.response;
  }

  try {
    await reorderCategories(c.env, reorderSchema.parse(body.body).items);
    return c.json({ ok: true });
  } catch (error) {
    return handleServiceError(c, error);
  }
});

categoriesRoutes.delete('/:id', async (c) => {
  try {
    await deleteCategory(c.env, idParamSchema.parse(c.req.param('id')));
    return c.body(null, 204);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

export default categoriesRoutes;
