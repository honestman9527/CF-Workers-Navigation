import { sql } from 'drizzle-orm';

/** UNION also terminates safely if imported legacy data contains a cycle. */
export const privateCategoryIds = sql`(
  WITH RECURSIVE private_categories(id) AS (
    SELECT id FROM categories WHERE visibility = 'private'
    UNION
    SELECT c.id FROM categories c JOIN private_categories p ON c.parent_id = p.id
  ) SELECT id FROM private_categories
)`;

/** All callers use the same b alias, including counts and FTS queries. */
export const publicBookmarkCondition = sql`b.visibility = 'public'
  AND (b.category_id IS NULL OR b.category_id NOT IN ${privateCategoryIds})
  AND b.archived_at IS NULL AND b.deleted_at IS NULL`;

export const bookmarkEffectiveVisibility = sql`CASE
  WHEN b.visibility = 'private' OR b.category_id IN ${privateCategoryIds}
  THEN 'private' ELSE 'public' END`;
export const categoryEffectiveVisibility = sql`CASE
  WHEN c.id IN ${privateCategoryIds} THEN 'private' ELSE 'public' END`;
