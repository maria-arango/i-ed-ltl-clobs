-- Amendments §51–§54, ADR 0002: the Narratives workspace.
CREATE TYPE "narrative_assignment_status" AS ENUM ('not_started', 'in_progress', 'submitted', 'returned');
--> statement-breakpoint
CREATE TYPE "narrative_revision_kind" AS ENUM ('import', 'snapshot', 'submit', 'reopen', 'restore', 'conflict_copy');
--> statement-breakpoint
CREATE TABLE "narrative_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL UNIQUE,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narratives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_code" text NOT NULL UNIQUE,
	"label" text NOT NULL,
	"lesson_id" text,
	"duration_label" text,
	"source_format" text NOT NULL,
	"source_text" text NOT NULL,
	"source_sha256" text NOT NULL UNIQUE,
	"initial_doc" jsonb NOT NULL,
	"parser_version" text NOT NULL,
	"episode_count" integer DEFAULT 0 NOT NULL,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"imported_by" uuid REFERENCES "users"("id"),
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text
);
--> statement-breakpoint
CREATE TABLE "narrative_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"narrative_id" uuid NOT NULL REFERENCES "narratives"("id"),
	"assignee_id" uuid NOT NULL REFERENCES "users"("id"),
	"order_no" integer NOT NULL,
	"video_url" text,
	"status" "narrative_assignment_status" DEFAULT 'not_started' NOT NULL,
	"status_reason" text,
	"template_id" uuid REFERENCES "narrative_templates"("id"),
	"assigned_by" uuid REFERENCES "users"("id"),
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"submitted_revision" integer,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"dataset" "dataset" DEFAULT 'live' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_assignment_per_narrative" ON "narrative_assignments" ("narrative_id") WHERE "status" <> 'returned';
--> statement-breakpoint
CREATE INDEX "narrative_assignments_by_assignee" ON "narrative_assignments" ("assignee_id", "order_no");
--> statement-breakpoint
CREATE TABLE "narrative_documents" (
	"assignment_id" uuid PRIMARY KEY NOT NULL REFERENCES "narrative_assignments"("id"),
	"revision" integer DEFAULT 0 NOT NULL,
	"doc" jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_client" text,
	"dataset" "dataset" DEFAULT 'live' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narrative_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL REFERENCES "narrative_assignments"("id"),
	"revision" integer NOT NULL,
	"kind" "narrative_revision_kind" NOT NULL,
	"doc" jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stats" jsonb,
	"created_by" uuid REFERENCES "users"("id"),
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dataset" "dataset" DEFAULT 'live' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "narrative_revisions_by_assignment" ON "narrative_revisions" ("assignment_id", "created_at");
--> statement-breakpoint
CREATE TABLE "narrative_sittings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL REFERENCES "narrative_assignments"("id"),
	"user_id" uuid NOT NULL REFERENCES "users"("id"),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"device" "device_kind" DEFAULT 'unknown' NOT NULL,
	"storage_persisted" boolean,
	"dataset" "dataset" DEFAULT 'live' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "narrative_sittings_by_assignment" ON "narrative_sittings" ("assignment_id");
--> statement-breakpoint
-- A submitted narrative cannot change, through any client, until an admin
-- reopens it (which flips the assignment status first). Rows are never
-- deleted, except sandbox (test/training) rows so fixtures can be purged.
CREATE OR REPLACE FUNCTION refuse_submitted_narrative_change() RETURNS trigger AS $$
DECLARE st narrative_assignment_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.dataset = 'live' THEN
      RAISE EXCEPTION 'narrative document % is never deleted', OLD.assignment_id;
    END IF;
    RETURN OLD;
  END IF;
  SELECT status INTO st FROM narrative_assignments WHERE id = NEW.assignment_id;
  IF st = 'submitted' THEN
    RAISE EXCEPTION 'narrative % is submitted and read-only', NEW.assignment_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER narrative_documents_submitted_are_frozen
  BEFORE UPDATE OR DELETE ON narrative_documents
  FOR EACH ROW EXECUTE FUNCTION refuse_submitted_narrative_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION refuse_narrative_revision_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.dataset <> 'live' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'narrative revisions are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER narrative_revisions_append_only
  BEFORE UPDATE OR DELETE ON narrative_revisions
  FOR EACH ROW EXECUTE FUNCTION refuse_narrative_revision_change();
