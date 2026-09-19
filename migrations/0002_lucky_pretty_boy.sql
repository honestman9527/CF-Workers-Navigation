ALTER TABLE `bookmarks` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `visibility` text DEFAULT 'private' NOT NULL;