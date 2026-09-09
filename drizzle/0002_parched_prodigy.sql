CREATE TABLE `hidden_conversations` (
	`user_id` text NOT NULL,
	`conversation` text NOT NULL,
	`hidden_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `conversation`),
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hidden_conversation` ON `hidden_conversations` (`conversation`);