import type { AdminStats } from '../../shared/api/types';
import type { Db } from '../types';

import { sql } from 'drizzle-orm';

type BookmarkCountRow = { total: number; active: number; archived: number; trash: number };
type MiscCountRow = { categories: number; tags: number };

export async function getAdminStats(db: Db): Promise<AdminStats> {
  const [bookmarkRow] = await db.all<BookmarkCountRow>(sql`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL AND archived_at IS NULL THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL AND archived_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS archived,
      COALESCE(SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS trash
    FROM bookmarks
  `);
  const [miscRow] = await db.all<MiscCountRow>(sql`
    SELECT
      (SELECT COUNT(*) FROM categories) AS categories,
      (SELECT COUNT(*) FROM tags) AS tags
  `);
  return {
    bookmarks: {
      total: Number(bookmarkRow?.total ?? 0),
      active: Number(bookmarkRow?.active ?? 0),
      archived: Number(bookmarkRow?.archived ?? 0),
      trash: Number(bookmarkRow?.trash ?? 0),
    },
    categories: Number(miscRow?.categories ?? 0),
    tags: Number(miscRow?.tags ?? 0),
  };
}
