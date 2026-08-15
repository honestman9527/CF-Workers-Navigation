CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`icon` text,
	`is_public` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_idx` ON `categories` (`slug`);
--> statement-breakpoint
CREATE INDEX `categories_parent_sort_idx` ON `categories` (`parent_id`,`sort_order`);
--> statement-breakpoint
CREATE INDEX `categories_public_parent_sort_idx` ON `categories` (`is_public`,`parent_id`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`icon_url` text,
	`is_public` integer DEFAULT true NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarks_category_public_sort_idx` ON `bookmarks` (`category_id`,`is_public`,`sort_order`);
--> statement-breakpoint
CREATE INDEX `bookmarks_category_sort_idx` ON `bookmarks` (`category_id`,`sort_order`);
--> statement-breakpoint
CREATE INDEX `bookmarks_public_sort_idx` ON `bookmarks` (`is_public`,`sort_order`,`id`);
--> statement-breakpoint
CREATE INDEX `bookmarks_url_idx` ON `bookmarks` (`url`);
--> statement-breakpoint
CREATE INDEX `bookmarks_pinned_sort_idx` ON `bookmarks` (`is_pinned`,`sort_order`,`id`);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
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
	DELETE FROM `bookmarks_fts` WHERE `rowid` = old.id;
END;
--> statement-breakpoint
PRAGMA optimize;
