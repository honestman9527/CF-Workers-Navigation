import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import { handleServiceError, idParamSchema, parseJson } from '../http';
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from '../services/categories';

const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  parentId: z.number().int().positive().nullable().optional(),
  icon: z.string().trim().min(1).max(40).nullable().optional(),
});

const categoryUpdateSchema = categoryInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()).max(500),
});

const categoriesRoutes = new Hono<AppEnv>();

categoriesRoutes.get('/', async (c) => c.json(await listCategories(c.get('db'))));

categoriesRoutes.post('/', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) return body.response;
  try {
    const input = categoryInputSchema.parse(body.body);
    return c.json(await createCategory(c.get('db'), input), 201);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

categoriesRoutes.put('/:id', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) return body.response;
  try {
    return c.json(
      await updateCategory(c.get('db'), idParamSchema.parse(c.req.param('id')), {
        ...categoryUpdateSchema.parse(body.body),
      }),
    );
  } catch (error) {
    return handleServiceError(c, error);
  }
});

categoriesRoutes.delete('/:id', async (c) => {
  try {
    await deleteCategory(c.get('db'), idParamSchema.parse(c.req.param('id')));
    return c.body(null, 204);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

categoriesRoutes.post('/reorder', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) return body.response;
  try {
    const input = reorderSchema.parse(body.body);
    await reorderCategories(c.get('db'), input.ids);
    return c.body(null, 204);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

export default categoriesRoutes;
