CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`contract` text NOT NULL,
	`pool_id` integer NOT NULL,
	`buyer` text NOT NULL,
	`uploader` text NOT NULL,
	`kind` text NOT NULL,
	`reference` text NOT NULL,
	`evidence_hash` text NOT NULL,
	`tx_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_transaction_hash` ON `evidence` (`tx_hash`,`evidence_hash`);