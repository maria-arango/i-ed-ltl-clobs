-- Amendment §53, ADR 0003: sign-in with email + personal 4-digit PIN.
CREATE TABLE "pin_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id"),
	"pin_hash" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"set_by" uuid REFERENCES "users"("id"),
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone
);
--> statement-breakpoint
-- Every PIN sign-in attempt, for throttling and the audit trail. The IP is
-- stored only as a keyed hash.
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" text NOT NULL,
	"user_id" uuid REFERENCES "users"("id"),
	"success" boolean NOT NULL,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_by_ip_time" ON "login_attempts" ("ip_hash", "occurred_at");
--> statement-breakpoint
-- Absolute session lifetime (12 h) needs to know when a session began.
ALTER TABLE "sessions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
