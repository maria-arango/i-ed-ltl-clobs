-- Amendment §49: three enumerator teams. Membership is history: leaving a
-- team sets removed_at (never a delete). Admins pass every team check.
CREATE TYPE "team" AS ENUM ('context_cards', 'scoring', 'narratives');
--> statement-breakpoint
CREATE TABLE "user_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id"),
	"team" "team" NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid REFERENCES "users"("id"),
	"removed_at" timestamp with time zone,
	"removed_by" uuid REFERENCES "users"("id"),
	"removed_reason" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_team_membership" ON "user_teams" ("user_id", "team") WHERE "removed_at" IS NULL;
--> statement-breakpoint
-- Every existing coder account worked on scoring: record that, so nobody's
-- access changes. This ADDS rows; it alters none.
INSERT INTO "user_teams" ("user_id", "team")
SELECT "id", 'scoring' FROM "users" WHERE "role" = 'coder';
