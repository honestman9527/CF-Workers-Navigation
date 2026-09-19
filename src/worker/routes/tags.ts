import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import { handleServiceError, idParamSchema, parseJson } from '../http';
import { createTag, deleteTag, listTags, mergeTag, updateTag } from '../services/tags';

const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

const mergeSchema = z.object({
  targetId: z.number().int().positive(),
});

const tagsRoutes = new Hono<AppEnv>();

tagsRoutes.get('/', async (c) => c.json(await listTags(c.get('db'), c.get('authed'))));

tagsRoutes.post('/', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) return body.response;
  try {
    const input = tagInputSchema.parse(body.body);
    return c.json(await createTag(c.get('db'), input), 201);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

tagsRoutes.put('/:id', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) return body.response;
  try {
    const input = tagInputSchema.parse(body.body);
    return c.json(await updateTag(c.get('db'), idParamSchema.parse(c.req.param('id')), input));
  } catch (error) {
    return handleServiceError(c, error);
  }
});

tagsRoutes.delete('/:id', async (c) => {
  try {
    await deleteTag(c.get('db'), idParamSchema.parse(c.req.param('id')));
    return c.body(null, 204);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

tagsRoutes.post('/:id/merge', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) return body.response;
  try {
    const { targetId } = mergeSchema.parse(body.body);
    return c.json(await mergeTag(c.get('db'), idParamSchema.parse(c.req.param('id')), targetId));
  } catch (error) {
    return handleServiceError(c, error);
  }
});

export default tagsRoutes;
