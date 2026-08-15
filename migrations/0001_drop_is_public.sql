DROP INDEX IF EXISTS `categories_public_parent_sort_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `bookmarks_category_public_sort_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `bookmarks_public_sort_idx`;
--> statement-breakpoint
ALTER TABLE `categories` DROP COLUMN `is_public`;
--> statement-breakpoint
ALTER TABLE `bookmarks` DROP COLUMN `is_public`;
