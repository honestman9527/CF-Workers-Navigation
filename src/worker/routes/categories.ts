import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import { handleServiceError, idParamSchema, parseJson, reorderItemsSchema } from '../http';
import {
  createCategory,
  deleteCategory,
  listCategoryTree,
  reorderCategories,
  toCategoryDto,
  updateCategory,
} from '../services/categories';

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

const reorderSchema = reorderItemsSchema('Category');

const categoriesRoutes = new Hono<AppEnv>();

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
