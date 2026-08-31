CREATE TYPE "public"."adult_role" AS ENUM('teacher', 'camera_operator', 'other');--> statement-breakpoint
CREATE TYPE "public"."arm" AS ENUM('control', 'dispersed', 'connected');--> statement-breakpoint
CREATE TYPE "public"."assignment_action" AS ENUM('assign', 'reassign', 'return_to_pool', 'void', 'transfer_card_duty');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('active', 'returned', 'voided', 'completed');--> statement-breakpoint
CREATE TYPE "public"."calibration_status" AS ENUM('scheduled', 'lobby', 'open', 'completed', 'voided');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('draft', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."certification_status" AS ENUM('in_progress', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."composition" AS ENUM('all_boys', 'all_girls', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."dataset" AS ENUM('live', 'test', 'training');--> statement-breakpoint
CREATE TYPE "public"."guidance_kind" AS ENUM('guiding_rule', 'reach_band');--> statement-breakpoint
CREATE TYPE "public"."observation_status" AS ENUM('not_started', 'in_progress', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."rater_status" AS ENUM('active', 'transferred', 'voided');--> statement-breakpoint
CREATE TYPE "public"."resolution" AS ENUM('agreed', 'a_moved', 'b_moved', 'both_moved');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'coder');--> statement-breakpoint
CREATE TYPE "public"."score_column" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."score_degree" AS ENUM('somewhat', 'very');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."speaks" AS ENUM('yes', 'no');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('pool', 'assigned', 'in_progress', 'complete', 'unusable', 'void');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "assignment_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" "assignment_action" NOT NULL,
	"video_id" uuid NOT NULL,
	"from_pair_id" uuid,
	"to_pair_id" uuid,
	"from_user_id" uuid,
	"to_user_id" uuid,
	"fills_context_card" boolean,
	"seed" text,
	"algorithm_version" text,
	"wave_no" integer,
	"reason" text,
	"actor_id" uuid,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_raters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"fills_context_card" boolean DEFAULT false NOT NULL,
	"previously_coded" boolean DEFAULT false NOT NULL,
	"status" "rater_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"pair_id" uuid NOT NULL,
	"wave_no" integer NOT NULL,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"priority_batch_flag" boolean DEFAULT false NOT NULL,
	"batch_label" text,
	"status" "assignment_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"subject_table" text,
	"subject_id" text,
	"details" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calibration_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"item_no" integer NOT NULL,
	"coder_a_score_id" uuid NOT NULL,
	"coder_b_score_id" uuid NOT NULL,
	"final_score_num" integer NOT NULL,
	"final_score_column" "score_column" NOT NULL,
	"final_score_degree" "score_degree" NOT NULL,
	"resolution" "resolution" NOT NULL,
	"consensus_rationale" text,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cal_item_no_range" CHECK ("calibration_items"."item_no" BETWEEN 1 AND 8),
	CONSTRAINT "final_score_encoding_fixed" CHECK ((final_score_num = 1 AND final_score_column = 'A' AND final_score_degree = 'very')
   OR (final_score_num = 2 AND final_score_column = 'A' AND final_score_degree = 'somewhat')
   OR (final_score_num = 3 AND final_score_column = 'B' AND final_score_degree = 'somewhat')
   OR (final_score_num = 4 AND final_score_column = 'B' AND final_score_degree = 'very'))
);
--> statement-breakpoint
CREATE TABLE "calibration_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calibration_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"pair_id" uuid NOT NULL,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"status" "calibration_status" DEFAULT 'scheduled' NOT NULL,
	"rubric_version_id" uuid,
	"completed_at" timestamp with time zone,
	"voided_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calibration_signoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"status" "certification_status" DEFAULT 'in_progress' NOT NULL,
	"threshold_spec" jsonb,
	"result_stats" jsonb,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coder_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fte_percent" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_adults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context_card_id" uuid NOT NULL,
	"adult_no" integer NOT NULL,
	"role" "adult_role",
	"sex" "sex",
	"clothing" text,
	"clothing_caveats" text,
	"features" text,
	"behavior" text,
	"speaks" "speaks",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "adult_no_range" CHECK ("context_adults"."adult_no" BETWEEN 1 AND 6)
);
--> statement-breakpoint
CREATE TABLE "context_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"authored_by" uuid NOT NULL,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"status" "card_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"subject" text,
	"composition" "composition",
	"approx_count" text,
	"uniforms" text,
	"appearance_caveats" text,
	"room" text,
	"camera" text,
	"notes" text,
	"timeline" text,
	"setting_change" text,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"flag_resolved_by" uuid,
	"flag_resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_cards_video_id_unique" UNIQUE("video_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"video_id" uuid,
	"observation_id" uuid,
	"session_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rubric_version_id" uuid,
	"row_counts" jsonb,
	"manifest" jsonb,
	"drive_file_ids" jsonb
);
--> statement-breakpoint
CREATE TABLE "field_help" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form" text NOT NULL,
	"field_key" text NOT NULL,
	"help_text" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gold_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"item_no" integer NOT NULL,
	"score_num" integer NOT NULL,
	"score_column" "score_column" NOT NULL,
	"score_degree" "score_degree" NOT NULL,
	"rationale" text,
	"rubric_version_id" uuid NOT NULL,
	"entered_by" uuid NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gold_item_no_range" CHECK ("gold_scores"."item_no" BETWEEN 1 AND 8),
	CONSTRAINT "gold_score_encoding_fixed" CHECK ((score_num = 1 AND score_column = 'A' AND score_degree = 'very')
   OR (score_num = 2 AND score_column = 'A' AND score_degree = 'somewhat')
   OR (score_num = 3 AND score_column = 'B' AND score_degree = 'somewhat')
   OR (score_num = 4 AND score_column = 'B' AND score_degree = 'very'))
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"video_timestamp_seconds" integer,
	"body" text NOT NULL,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"coder_id" uuid NOT NULL,
	"assignment_rater_id" uuid,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"status" "observation_status" DEFAULT 'not_started' NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"n_sessions" integer,
	"rubric_version_id" uuid,
	"is_seeded_recheck" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pair_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pair_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"formed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dissolved_at" timestamp with time zone,
	"dissolved_reason" text
);
--> statement-breakpoint
CREATE TABLE "pupil_tallies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"label" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_anchors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"score_num" integer NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "anchor_score_range" CHECK ("rubric_anchors"."score_num" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "rubric_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_version_id" uuid NOT NULL,
	"item_no" integer NOT NULL,
	"name" text NOT NULL,
	"statement" text NOT NULL,
	"importance" text NOT NULL,
	"special_note" text NOT NULL,
	CONSTRAINT "concept_item_no_range" CHECK ("rubric_concepts"."item_no" BETWEEN 1 AND 8)
);
--> statement-breakpoint
CREATE TABLE "rubric_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"score_num" integer NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_guidance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_version_id" uuid NOT NULL,
	"kind" "guidance_kind" NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_label" text NOT NULL,
	"source_ref" text,
	"effective_from" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rubric_versions_version_label_unique" UNIQUE("version_label")
);
--> statement-breakpoint
CREATE TABLE "score_note_citations" (
	"score_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	CONSTRAINT "score_note_citations_score_id_note_id_pk" PRIMARY KEY("score_id","note_id")
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"item_no" integer NOT NULL,
	"score_num" integer NOT NULL,
	"score_column" "score_column" NOT NULL,
	"score_degree" "score_degree" NOT NULL,
	"justification" text,
	"rubric_version_id" uuid NOT NULL,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	CONSTRAINT "item_no_range" CHECK ("scores"."item_no" BETWEEN 1 AND 8),
	CONSTRAINT "score_encoding_fixed" CHECK ((score_num = 1 AND score_column = 'A' AND score_degree = 'very')
   OR (score_num = 2 AND score_column = 'A' AND score_degree = 'somewhat')
   OR (score_num = 3 AND score_column = 'B' AND score_degree = 'somewhat')
   OR (score_num = 4 AND score_column = 'B' AND score_degree = 'very'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" "role" DEFAULT 'coder' NOT NULL,
	"is_chief_coder" boolean DEFAULT false NOT NULL,
	"dataset_scope" "dataset" DEFAULT 'live' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"deactivated_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "video_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"raw_filename" text NOT NULL,
	"sid" text NOT NULL,
	"tr_id" text NOT NULL,
	"arm" "arm" NOT NULL,
	"teacher_assignment" text,
	"subject" text,
	"recorded_year" integer,
	"excluded" boolean DEFAULT false NOT NULL,
	"excluded_reason" text,
	"import_batch" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_provenance_video_id_unique" UNIQUE("video_id")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_code" text NOT NULL,
	"drive_url" text,
	"duration_seconds" integer,
	"dataset" "dataset" DEFAULT 'live' NOT NULL,
	"status" "video_status" DEFAULT 'pool' NOT NULL,
	"is_gold" boolean DEFAULT false NOT NULL,
	"unusable_reason" text,
	"unusable_flagged_by" uuid,
	"unusable_flagged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "videos_display_code_unique" UNIQUE("display_code")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_log" ADD CONSTRAINT "assignment_log_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_log" ADD CONSTRAINT "assignment_log_from_pair_id_pairs_id_fk" FOREIGN KEY ("from_pair_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_log" ADD CONSTRAINT "assignment_log_to_pair_id_pairs_id_fk" FOREIGN KEY ("to_pair_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_log" ADD CONSTRAINT "assignment_log_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_log" ADD CONSTRAINT "assignment_log_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_log" ADD CONSTRAINT "assignment_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_raters" ADD CONSTRAINT "assignment_raters_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_raters" ADD CONSTRAINT "assignment_raters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_session_id_calibration_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."calibration_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_coder_a_score_id_scores_id_fk" FOREIGN KEY ("coder_a_score_id") REFERENCES "public"."scores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_coder_b_score_id_scores_id_fk" FOREIGN KEY ("coder_b_score_id") REFERENCES "public"."scores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_presence" ADD CONSTRAINT "calibration_presence_session_id_calibration_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."calibration_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_presence" ADD CONSTRAINT "calibration_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_sessions" ADD CONSTRAINT "calibration_sessions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_sessions" ADD CONSTRAINT "calibration_sessions_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_sessions" ADD CONSTRAINT "calibration_sessions_rubric_version_id_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."rubric_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_signoffs" ADD CONSTRAINT "calibration_signoffs_session_id_calibration_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."calibration_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_signoffs" ADD CONSTRAINT "calibration_signoffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coder_availability" ADD CONSTRAINT "coder_availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_adults" ADD CONSTRAINT "context_adults_context_card_id_context_cards_id_fk" FOREIGN KEY ("context_card_id") REFERENCES "public"."context_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_cards" ADD CONSTRAINT "context_cards_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_cards" ADD CONSTRAINT "context_cards_authored_by_users_id_fk" FOREIGN KEY ("authored_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_cards" ADD CONSTRAINT "context_cards_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_cards" ADD CONSTRAINT "context_cards_flag_resolved_by_users_id_fk" FOREIGN KEY ("flag_resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_calibration_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."calibration_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_rubric_version_id_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."rubric_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_scores" ADD CONSTRAINT "gold_scores_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_scores" ADD CONSTRAINT "gold_scores_rubric_version_id_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."rubric_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_scores" ADD CONSTRAINT "gold_scores_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_coder_id_users_id_fk" FOREIGN KEY ("coder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_assignment_rater_id_assignment_raters_id_fk" FOREIGN KEY ("assignment_rater_id") REFERENCES "public"."assignment_raters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_rubric_version_id_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."rubric_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_members" ADD CONSTRAINT "pair_members_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_members" ADD CONSTRAINT "pair_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pupil_tallies" ADD CONSTRAINT "pupil_tallies_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_anchors" ADD CONSTRAINT "rubric_anchors_concept_id_rubric_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."rubric_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_concepts" ADD CONSTRAINT "rubric_concepts_rubric_version_id_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."rubric_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_examples" ADD CONSTRAINT "rubric_examples_concept_id_rubric_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."rubric_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_guidance" ADD CONSTRAINT "rubric_guidance_rubric_version_id_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."rubric_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_indicators" ADD CONSTRAINT "rubric_indicators_concept_id_rubric_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."rubric_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_note_citations" ADD CONSTRAINT "score_note_citations_score_id_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."scores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_note_citations" ADD CONSTRAINT "score_note_citations_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_rubric_version_id_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."rubric_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_provenance" ADD CONSTRAINT "video_provenance_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_unusable_flagged_by_users_id_fk" FOREIGN KEY ("unusable_flagged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_card_filler_per_assignment" ON "assignment_raters" USING btree ("assignment_id") WHERE "assignment_raters"."fills_context_card" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "one_rater_row_per_user_per_assignment" ON "assignment_raters" USING btree ("assignment_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_item_per_session" ON "calibration_items" USING btree ("session_id","item_no");--> statement-breakpoint
CREATE UNIQUE INDEX "one_signoff_per_user_per_session" ON "calibration_signoffs" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_adult_no_per_card" ON "context_adults" USING btree ("context_card_id","adult_no");--> statement-breakpoint
CREATE INDEX "events_by_time" ON "events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_gold_score_per_item" ON "gold_scores" USING btree ("video_id","item_no");--> statement-breakpoint
CREATE INDEX "notes_by_observation" ON "notes" USING btree ("observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_observation_per_coder_video" ON "observations" USING btree ("video_id","coder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_anchor_per_score" ON "rubric_anchors" USING btree ("concept_id","score_num");--> statement-breakpoint
CREATE UNIQUE INDEX "one_concept_per_item_per_version" ON "rubric_concepts" USING btree ("rubric_version_id","item_no");--> statement-breakpoint
CREATE UNIQUE INDEX "one_score_per_item_per_observation" ON "scores" USING btree ("observation_id","item_no");