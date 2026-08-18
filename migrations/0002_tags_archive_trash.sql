ALTER TABLE `bookmarks` ADD COLUMN `archived_at` text;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD COLUMN `deleted_at` text;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD COLUMN `url_normalized` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `bookmarks` SET `url_normalized` = lower(rtrim(`url`, '/')) WHERE `url_normalized` = '';
--> statement-breakpoint
CREATE INDEX `bookmarks_status_idx` ON `bookmarks` (`deleted_at`,`archived_at`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `bookmarks_url_normalized_idx` ON `bookmarks` (`url_normalized`);
--> statement-breakpoint
CREATE TABLE `tags` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_idx` ON `tags` (`slug`);
--> statement-breakpoint
CREATE TABLE `bookmark_tags` (
  `bookmark_id` integer NOT NULL,
  `tag_id` integer NOT NULL,
  FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON DELETE cascade,
  FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_tags_unique_idx` ON `bookmark_tags` (`bookmark_id`,`tag_id`);
--> statement-breakpoint
PRAGMA optimize;
