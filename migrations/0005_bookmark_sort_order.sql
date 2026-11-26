ALTER TABLE `bookmarks` ADD `sort_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
WITH ranked AS (
  SELECT
    `id`,
    ROW_NUMBER() OVER (
      PARTITION BY `category_id`
      ORDER BY `created_at` ASC, `id` ASC
    ) - 1 AS `rn`
  FROM `bookmarks`
)
UPDATE `bookmarks`
SET `sort_order` = (SELECT `rn` FROM `ranked` WHERE `ranked`.`id` = `bookmarks`.`id`);
--> statement-breakpoint
CREATE INDEX `bookmarks_category_status_sort_idx` ON `bookmarks` (`category_id`,`deleted_at`,`archived_at`,`sort_order`,`id`);
