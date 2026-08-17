import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import { getDb } from '../db';
import { jsonError } from '../errors';
import {
  handleServiceError,
  idParamSchema,
  includeChildrenRequested,
  parseJson,
  reorderItemsSchema,
} from '../http';
import { fetchBookmarkMetadata } from '../metadata';
import {
  createBookmark,
  deleteBookmark,
  getBookmark,
  listBookmarks,
  listPinnedBookmarks,
  reorderBookmarks,
  searchBookmarks,
  updateBookmark,
} from '../services/bookmarks';
import { getSettings } from '../settings';

const bookmarkInputSchema = z.object({
  categoryId: z.number().int().positive(),
  title: z.string().trim().min(1),
  url: z.string().trim().url(),
  description: z.string().nullable().optional(),
  iconUrl: z.string().trim().url().nullable().optional(),
  isPinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const bookmarkUpdateSchema = bookmarkInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const reorderSchema = reorderItemsSchema('Bookmark');

const categoryQuerySchema = z.coerce.number().int().positive().optional();
const metadataQuerySchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'URL must use http or https');

const bookmarksRoutes = new Hono<AppEnv>();

bookmarksRoutes.get('/search', async (c) => {
  const query = z.string().trim().min(1).max(100).parse(c.req.query('q'));
  return c.json(await searchBookmarks(c.env, query));
});

bookmarksRoutes.get('/pinned', async (c) => {
  return c.json(await listPinnedBookmarks(c.env));
});

bookmarksRoutes.get('/metadata', async (c) => {
  const url = metadataQuerySchema.parse(c.req.query('url'));
  const config = await getSettings(getDb(c.env));
  const result = await fetchBookmarkMetadata(url, config);

  if (!result.ok) {
    if (result.error === 'Invalid URL') {
      return jsonError(c, 400, 'validation_error', result.error);
    }
    return jsonError(c, 502, 'bad_gateway', result.error);
  }

  return c.json(result.metadata);
});

bookmarksRoutes.get('/', async (c) => {
  const categoryId = categoryQuerySchema.parse(c.req.query('category'));
  const includeChildren = includeChildrenRequested(c.req.query('includeChildren'));
  return c.json(await listBookmarks(c.env, { categoryId, includeChildren }));
});

bookmarksRoutes.post('/', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) {
    return body.response;
  }

  try {
    const bookmark = await createBookmark(c.env, bookmarkInputSchema.parse(body.body));
    return c.json(bookmark, 201);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.patch('/reorder', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) {
    return body.response;
  }

  try {
    await reorderBookmarks(c.env, reorderSchema.parse(body.body).items);
    return c.json({ ok: true });
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.get('/:id', async (c) => {
  try {
    return c.json(await getBookmark(c.env, idParamSchema.parse(c.req.param('id'))));
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.put('/:id', async (c) => {
  const id = idParamSchema.parse(c.req.param('id'));
  const body = await parseJson(c);
  if (!body.ok) {
    return body.response;
  }

  try {
    return c.json(await updateBookmark(c.env, id, bookmarkUpdateSchema.parse(body.body)));
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.delete('/:id', async (c) => {
  try {
    await deleteBookmark(c.env, idParamSchema.parse(c.req.param('id')));
    return c.body(null, 204);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

export default bookmarksRoutes;
