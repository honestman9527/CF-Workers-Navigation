CREATE INDEX `bookmarks_category_status_created_idx` ON `bookmarks` (`category_id`,`deleted_at`,`archived_at`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `bookmarks_url_normalized_deleted_idx` ON `bookmarks` (`url_normalized`) WHERE "bookmarks"."deleted_at" IS NOT NULL;
