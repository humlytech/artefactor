CREATE TABLE `artefact_access` (
	`artefact_id` text NOT NULL,
	`user_id` text NOT NULL,
	`granted_at` integer NOT NULL,
	PRIMARY KEY(`artefact_id`, `user_id`),
	FOREIGN KEY (`artefact_id`) REFERENCES `artefact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artefact_access_user_idx` ON `artefact_access` (`user_id`);