CREATE INDEX `bookmark_tags_tag_idx` ON `bookmark_tags` (`tag_id`);
--> statement-breakpoint
PRAGMA optimize;
