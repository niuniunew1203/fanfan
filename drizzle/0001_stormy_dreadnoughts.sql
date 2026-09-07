CREATE TABLE `auth_attempts` (
	`attempt_key` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`locked_until` text
);
--> statement-breakpoint
CREATE TABLE `guest_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`pin_salt` text NOT NULL,
	`pin_hash` text NOT NULL,
	`iterations` integer DEFAULT 210000 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`return_to` text DEFAULT '/' NOT NULL,
	`bind_user_id` text,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_identities` (
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_identity_unique_idx` ON `user_identities` (`provider`,`subject`);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_key` text;--> statement-breakpoint
INSERT OR IGNORE INTO `user_identities` (`provider`, `subject`, `user_id`)
SELECT `auth_provider`, `auth_subject`, `id` FROM `users`;
