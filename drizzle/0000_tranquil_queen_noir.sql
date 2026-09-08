CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`a` text NOT NULL,
	`b` text NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`a`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`b`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_pair` ON `conversations` (`a`,`b`);--> statement-breakpoint
CREATE INDEX `conversation_b` ON `conversations` (`b`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	`file_id` text,
	`filename` text,
	`mime` text,
	`read_at` integer,
	FOREIGN KEY (`conversation`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `message_conversation_time` ON `messages` (`conversation`,`created`);--> statement-breakpoint
CREATE INDEX `message_file` ON `messages` (`file_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_username_unique` ON `profiles` (`username`);