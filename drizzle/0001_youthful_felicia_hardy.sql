CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation` text NOT NULL,
	`sender` text NOT NULL,
	`object_key` text NOT NULL,
	`upload_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	FOREIGN KEY (`conversation`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `upload_sender_status` ON `uploads` (`sender`,`status`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `avatar_id` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `accent` text DEFAULT '#8b7cff' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `background` text DEFAULT 'aurora' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `density` text DEFAULT 'comfortable' NOT NULL;