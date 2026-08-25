import type { AppEnv } from '../types';

import { Hono } from 'hono';
import { z } from 'zod';

import { jsonError } from '../errors';
import {
  handleServiceError,
  idParamSchema,
  limitSchema,
  offsetSchema,
  parseBooleanQuery,
  parseJson,
  cursorSchema,
} from '../http';
import { faviconUrlFor, fetchBookmarkMetadata } from '../metadata';
import {
  archiveBookmark,
  createBookmark,
  deleteBookmark,
  getBookmark,
  listBookmarks,
  permanentlyDeleteBookmark,
  restoreBookmark,
  searchBookmarks,
  updateBookmark,
} from '../services/bookmarks';
import { listTags } from '../services/tags';
import { getSettings } from '../settings';

const bookmarkInputSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().trim().url(),
  description: z.string().nullable().optional(),
  iconUrl: z.string().trim().url().nullable().optional(),
  isPinned: z.boolean().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
});

const bookmarkUpdateSchema = bookmarkInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

const metadataQuerySchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'URL must use http or https');

const viewSchema = z.enum(['active', 'archive', 'trash', 'all']).default('active');
const slugQuerySchema = z.string().trim().min(1).max(64).optional();
const bookmarksRoutes = new Hono<AppEnv>();

bookmarksRoutes.get('/search', async (c) => {
  try {
    const query = z.string().trim().min(1).max(100).parse(c.req.query('q'));
    const page = await searchBookmarks(c.get('db'), query, {
      view: viewSchema.parse(c.req.query('view')),
      category: slugQuerySchema.parse(c.req.query('category')),
      tag: slugQuerySchema.parse(c.req.query('tag')),
      pinned: parseBooleanQuery(c.req.query('pinned')),
      cursor: cursorSchema.parse(c.req.query('cursor')),
      limit: limitSchema.parse(c.req.query('limit')),
      offset: offsetSchema.parse(c.req.query('offset')),
    });
    return c.json(page);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.get('/tags', async (c) => c.json(await listTags(c.get('db'))));

bookmarksRoutes.get('/metadata', async (c) => {
  const url = metadataQuerySchema.parse(c.req.query('url'));
  const result = await fetchBookmarkMetadata(url, await getSettings(c.get('db')));
  if (!result.ok) {
    if (result.error === 'Invalid URL') return jsonError(c, 400, 'validation_error', result.error);
    return jsonError(c, 502, 'bad_gateway', result.error);
  }
  return c.json(result.metadata);
});

bookmarksRoutes.get('/favicon', async (c) => {
  const url = metadataQuerySchema.parse(c.req.query('url'));
  const iconUrl = faviconUrlFor(url, await getSettings(c.get('db')));
  return c.json({ url, iconUrl, source: iconUrl ? ('proxy' as const) : ('none' as const) });
});

bookmarksRoutes.get('/', async (c) => {
  try {
    return c.json(
      await listBookmarks(c.get('db'), {
        view: viewSchema.parse(c.req.query('view')),
        category: slugQuerySchema.parse(c.req.query('category')),
        tag: slugQuerySchema.parse(c.req.query('tag')),
        pinned: parseBooleanQuery(c.req.query('pinned')),
        cursor: cursorSchema.parse(c.req.query('cursor')),
        limit: limitSchema.parse(c.req.query('limit')),
        offset: offsetSchema.parse(c.req.query('offset')),
      }),
    );
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.post('/', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) return body.response;
  try {
    const input = bookmarkInputSchema.parse(body.body);
    if (input.iconUrl === undefined) {
      input.iconUrl = faviconUrlFor(input.url, await getSettings(c.get('db'))) || null;
    }
    return c.json(await createBookmark(c.get('db'), input), 201);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.get('/:id', async (c) => {
  try {
    return c.json(await getBookmark(c.get('db'), idParamSchema.parse(c.req.param('id'))));
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.put('/:id', async (c) => {
  const body = await parseJson(c);
  if (!body.ok) return body.response;
  try {
    return c.json(
      await updateBookmark(
        c.get('db'),
        idParamSchema.parse(c.req.param('id')),
        bookmarkUpdateSchema.parse(body.body),
      ),
    );
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.post('/:id/archive', async (c) => {
  try {
    return c.json(await archiveBookmark(c.get('db'), idParamSchema.parse(c.req.param('id'))));
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.post('/:id/restore', async (c) => {
  try {
    return c.json(await restoreBookmark(c.get('db'), idParamSchema.parse(c.req.param('id'))));
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.delete('/:id', async (c) => {
  try {
    await deleteBookmark(c.get('db'), idParamSchema.parse(c.req.param('id')));
    return c.body(null, 204);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

bookmarksRoutes.delete('/:id/permanent', async (c) => {
  try {
    await permanentlyDeleteBookmark(c.get('db'), idParamSchema.parse(c.req.param('id')));
    return c.body(null, 204);
  } catch (error) {
    return handleServiceError(c, error);
  }
});

export default bookmarksRoutes;
