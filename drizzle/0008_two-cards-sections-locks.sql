-- Phase 2 of docs/08-next-steps-plan.md (Amendments §43–45).

-- §43 Both coders fill the context card: one card per video PER CODER.
ALTER TABLE "context_cards" DROP CONSTRAINT IF EXISTS "context_cards_video_id_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "one_card_per_video_per_coder"
  ON "context_cards" ("video_id", "authored_by");

-- §44 Timed sections: one row per sitting on the card / notes / scores.
CREATE TYPE "section_kind" AS ENUM ('context_card', 'notes', 'scores');
CREATE TYPE "section_end_reason" AS ENUM ('submitted', 'closed', 'abrupt', 'admin_released');
CREATE TYPE "device_kind" AS ENUM ('phone', 'tablet', 'desktop', 'unknown');

CREATE TABLE "section_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "observation_id" uuid NOT NULL REFERENCES "observations"("id"),
  "coder_id" uuid NOT NULL REFERENCES "users"("id"),
  "video_id" uuid NOT NULL REFERENCES "videos"("id"),
  "section" "section_kind" NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  "end_reason" "section_end_reason",
  -- Filled by the coder when a previous sitting on the same section did
  -- not end with a submission ("why were you cut off?").
  "resume_reason" text,
  "device" "device_kind" DEFAULT 'unknown' NOT NULL,
  "dataset" "dataset" DEFAULT 'live' NOT NULL
);
CREATE INDEX "section_sessions_by_observation" ON "section_sessions" ("observation_id", "section");

-- §45 Single-sitting videos: a coder holds at most one active video lock.
CREATE TABLE "video_locks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coder_id" uuid NOT NULL REFERENCES "users"("id"),
  "video_id" uuid NOT NULL REFERENCES "videos"("id"),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "released_at" timestamp with time zone,
  "released_by" uuid REFERENCES "users"("id"),
  "release_reason" text,
  "dataset" "dataset" DEFAULT 'live' NOT NULL
);
CREATE UNIQUE INDEX "one_active_lock_per_coder" ON "video_locks" ("coder_id") WHERE "released_at" IS NULL;
