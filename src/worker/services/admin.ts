import type { AdminStats } from '../../shared/api/types';
import type { Db } from '../types';

import { sql } from 'drizzle-orm';

type StatsRow = {
  total: number;
  active: number;
  archived: number;
  trash: number;
  categories: number;
  tags: number;
};

export async function getAdminStats(db: Db): Promise<AdminStats> {
  const [row] = await db.all<StatsRow>(sql`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL AND archived_at IS NULL THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL AND archived_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS archived,
      COALESCE(SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS trash,
      (SELECT COUNT(*) FROM categories) AS categories,
      (SELECT COUNT(*) FROM tags) AS tags
    FROM bookmarks
  `);
  return {
    bookmarks: {
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      archived: Number(row?.archived ?? 0),
      trash: Number(row?.trash ?? 0),
    },
    categories: Number(row?.categories ?? 0),
    tags: Number(row?.tags ?? 0),
  };
}
