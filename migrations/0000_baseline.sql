CREATE TABLE `bookmark_tags` (
	`bookmark_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_tags_unique_idx` ON `bookmark_tags` (`bookmark_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `bookmark_tags_tag_idx` ON `bookmark_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`icon_url` text,
	`is_pinned` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`url_normalized` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bookmarks_status_created_idx` ON `bookmarks` (`deleted_at`,`archived_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `bookmarks_pinned_created_idx` ON `bookmarks` (`is_pinned`,`deleted_at`,`archived_at`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_url_normalized_idx` ON `bookmarks` (`url_normalized`) WHERE "bookmarks"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
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
INSERT INTO `settings` (`key`, `value`) VALUES
	('favicon_proxy_url', 'https://www.google.com/s2/favicons?domain={domain}&sz=64'),
	('favicon_proxy_enabled', 'true');
--> statement-breakpoint
CREATE VIRTUAL TABLE `bookmarks_fts` USING fts5(
	`title`,
	`description`,
	`url`,
	content='bookmarks',
	content_rowid='id'
);
--> statement-breakpoint
CREATE TRIGGER `bookmarks_fts_insert` AFTER INSERT ON `bookmarks` BEGIN
	INSERT INTO `bookmarks_fts` (`rowid`, `title`, `description`, `url`)
	VALUES (new.id, new.title, COALESCE(new.description, ''), new.url);
END;
--> statement-breakpoint
CREATE TRIGGER `bookmarks_fts_update` AFTER UPDATE ON `bookmarks`
WHEN old.title IS NOT new.title OR old.description IS NOT new.description OR old.url IS NOT new.url
BEGIN
	INSERT INTO `bookmarks_fts` (`bookmarks_fts`, `rowid`, `title`, `description`, `url`)
	VALUES ('delete', old.id, old.title, COALESCE(old.description, ''), old.url);
	INSERT INTO `bookmarks_fts` (`rowid`, `title`, `description`, `url`)
	VALUES (new.id, new.title, COALESCE(new.description, ''), new.url);
END;
--> statement-breakpoint
CREATE TRIGGER `bookmarks_fts_delete` AFTER DELETE ON `bookmarks` BEGIN
	INSERT INTO `bookmarks_fts` (`bookmarks_fts`, `rowid`, `title`, `description`, `url`)
	VALUES ('delete', old.id, old.title, COALESCE(old.description, ''), old.url);
END;
--> statement-breakpoint
PRAGMA optimize;
