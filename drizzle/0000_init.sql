CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`type` text NOT NULL,
	`note` text,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "activities_type_check" CHECK("activities"."type" IN ('request_received', 'call_talked', 'voicemail', 'no_answer', 'text', 'email', 'customer_called', 'note', 'status_change', 'quote_sent', 'scheduled', 'follow_up_set'))
);
--> statement-breakpoint
CREATE INDEX `activities_job_id_created_at_idx` ON `activities` (`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`business_name` text,
	`phone` text,
	`phone_digits` text,
	`email` text,
	`address` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_phone_digits_idx` ON `customers` (`phone_digits`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`description` text NOT NULL,
	`equipment` text,
	`source` text NOT NULL,
	`referred_by` text,
	`status` text DEFAULT 'new' NOT NULL,
	`is_emergency` integer DEFAULT false NOT NULL,
	`quote_amount_cents` integer,
	`quote_sent_at` integer,
	`technician_id` integer,
	`scheduled_for` text,
	`follow_up_on` text,
	`last_contact_at` integer,
	`received_at` integer NOT NULL,
	`closed_at` integer,
	`lost_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "jobs_status_check" CHECK("jobs"."status" IN ('new', 'needs_quote', 'quote_sent', 'ready_to_schedule', 'scheduled', 'done', 'lost')),
	CONSTRAINT "jobs_source_check" CHECK("jobs"."source" IN ('phone', 'website', 'email', 'text', 'repeat', 'referral', 'other')),
	CONSTRAINT "jobs_lost_reason_check" CHECK("jobs"."lost_reason" IS NULL OR "jobs"."lost_reason" IN ('went_elsewhere', 'too_expensive', 'fixed_themselves', 'no_response', 'other'))
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_customer_id_idx` ON `jobs` (`customer_id`);--> statement-breakpoint
CREATE TABLE `technicians` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
