DROP INDEX IF EXISTS `bookmarks_url_normalized_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `bookmarks_pinned_created_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_category_url_normalized_idx` ON `bookmarks` (`category_id`, `url_normalized`) WHERE `deleted_at` IS NULL AND `category_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_uncategorized_url_normalized_idx` ON `bookmarks` (`url_normalized`) WHERE `deleted_at` IS NULL AND `category_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `categories` ADD `system_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_system_key_idx` ON `categories` (`system_key`) WHERE `system_key` IS NOT NULL;
--> statement-breakpoint
UPDATE `categories`
SET `system_key` = 'common', `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = (
  SELECT `id` FROM `categories`
  WHERE `parent_id` IS NULL AND `slug` IN ('common', '常用')
  ORDER BY CASE `slug` WHEN 'common' THEN 0 ELSE 1 END, `sort_order`, `id`
  LIMIT 1
);
--> statement-breakpoint
UPDATE `categories`
SET `sort_order` = `sort_order` + 1
WHERE `parent_id` IS NULL AND (`system_key` IS NULL OR `system_key` != 'common');
--> statement-breakpoint
UPDATE `categories`
SET `sort_order` = 0, `updated_at` = CURRENT_TIMESTAMP
WHERE `system_key` = 'common';
--> statement-breakpoint
INSERT INTO `categories` (`name`, `slug`, `icon`, `parent_id`, `sort_order`, `visibility`, `system_key`)
SELECT
  '常用',
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'common') THEN 'common'
    WHEN NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'builtin-common') THEN 'builtin-common'
    ELSE 'builtin-common-' || COALESCE((SELECT MAX(`id`) + 1 FROM `categories`), 1)
  END,
  'Star',
  NULL,
  0,
  'public',
  'common'
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `system_key` = 'common');
--> statement-breakpoint
CREATE TABLE `_pinned_migration_sources` (
  `source_id` integer PRIMARY KEY NOT NULL,
  `url_normalized` text NOT NULL,
  `effective_visibility` text NOT NULL,
  `next_sort_order` integer NOT NULL
);
--> statement-breakpoint
WITH common_cat AS (
  SELECT `id` FROM `categories` WHERE `system_key` = 'common' LIMIT 1
),
base_order AS (
  SELECT COALESCE(MAX(`sort_order`), -1) AS `max_order`
  FROM `bookmarks`
  WHERE `category_id` = (SELECT `id` FROM common_cat)
),
eligible AS (
  SELECT
    b.`id` AS `source_id`,
    b.`url_normalized`,
    CASE
      WHEN b.`visibility` = 'private'
        OR EXISTS (
          SELECT 1 FROM `categories` c
          LEFT JOIN `categories` p ON p.`id` = c.`parent_id`
          WHERE c.`id` = b.`category_id`
            AND (c.`visibility` = 'private' OR p.`visibility` = 'private')
        )
      THEN 'private'
      ELSE b.`visibility`
    END AS `effective_visibility`,
    ROW_NUMBER() OVER (ORDER BY b.`created_at` DESC, b.`id` DESC) AS `rn`
  FROM `bookmarks` b
  WHERE b.`is_pinned` = 1
    AND b.`deleted_at` IS NULL
    AND b.`archived_at` IS NULL
    AND (b.`category_id` IS NULL OR b.`category_id` != (SELECT `id` FROM common_cat))
    AND NOT EXISTS (
      SELECT 1 FROM `bookmarks` existing
      WHERE existing.`category_id` = (SELECT `id` FROM common_cat)
        AND existing.`deleted_at` IS NULL
        AND existing.`url_normalized` = b.`url_normalized`
    )
)
INSERT INTO `_pinned_migration_sources` (`source_id`, `url_normalized`, `effective_visibility`, `next_sort_order`)
SELECT `source_id`, `url_normalized`, `effective_visibility`, (SELECT `max_order` FROM base_order) + `rn`
FROM eligible;
--> statement-breakpoint
INSERT INTO `bookmarks` (`visibility`, `category_id`, `title`, `url`, `description`, `icon_url`, `is_pinned`, `sort_order`, `archived_at`, `deleted_at`, `url_normalized`, `created_at`, `updated_at`)
SELECT
  m.`effective_visibility`,
  (SELECT `id` FROM `categories` WHERE `system_key` = 'common' LIMIT 1),
  s.`title`,
  s.`url`,
  s.`description`,
  s.`icon_url`,
  0,
  m.`next_sort_order`,
  NULL,
  NULL,
  s.`url_normalized`,
  s.`created_at`,
  CURRENT_TIMESTAMP
FROM `_pinned_migration_sources` m
INNER JOIN `bookmarks` s ON s.`id` = m.`source_id`;
--> statement-breakpoint
INSERT OR IGNORE INTO `bookmark_tags` (`bookmark_id`, `tag_id`)
SELECT dst.`id`, bt.`tag_id`
FROM `_pinned_migration_sources` m
INNER JOIN `bookmarks` dst
  ON dst.`category_id` = (SELECT `id` FROM `categories` WHERE `system_key` = 'common' LIMIT 1)
  AND dst.`deleted_at` IS NULL
  AND dst.`url_normalized` = m.`url_normalized`
INNER JOIN `bookmark_tags` bt ON bt.`bookmark_id` = m.`source_id`;
--> statement-breakpoint
DROP TABLE `_pinned_migration_sources`;
--> statement-breakpoint
CREATE TRIGGER `categories_system_insert` BEFORE INSERT ON `categories`
WHEN NEW.`system_key` IS NOT NULL AND NEW.`parent_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'system_category_protected');
END;
--> statement-breakpoint
CREATE TRIGGER `categories_system_update` BEFORE UPDATE OF `parent_id`, `system_key` ON `categories`
WHEN (
  OLD.`system_key` IS NOT NULL AND (NEW.`parent_id` IS NOT NULL OR NEW.`system_key` IS NOT OLD.`system_key`)
) OR (
  NEW.`system_key` IS NOT NULL AND NEW.`parent_id` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'system_category_protected');
END;
--> statement-breakpoint
CREATE TRIGGER `categories_system_delete` BEFORE DELETE ON `categories`
WHEN OLD.`system_key` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'system_category_protected');
END;
