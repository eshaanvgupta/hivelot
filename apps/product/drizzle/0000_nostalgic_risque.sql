CREATE TABLE `accounts` (
	`wallet` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`supplier` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`message` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`pool_id` text,
	`wallet` text NOT NULL,
	`kind` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `interests` (
	`id` text PRIMARY KEY NOT NULL,
	`pool_id` text NOT NULL,
	`wallet` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interest_pool_wallet` ON `interests` (`pool_id`,`wallet`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`pool_id` text NOT NULL,
	`wallet` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`pool_id` text NOT NULL,
	`wallet` text NOT NULL,
	`price` text NOT NULL,
	`capacity` integer NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offer_pool_wallet` ON `offers` (`pool_id`,`wallet`);--> statement-breakpoint
CREATE TABLE `pools` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`region` text NOT NULL,
	`target` integer NOT NULL,
	`minimum` integer NOT NULL,
	`price` text NOT NULL,
	`closes_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`onchain_id` text,
	`tx_hash` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`expires_at` integer NOT NULL
);
