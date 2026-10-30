-- Amendment §61: review scripts, lesson ids kept for admins, video checks,
-- practice narratives. Additive only; no row is changed.
--
-- The video file name each assignment was checked against, and how it was
-- checked ('drive' = the name Google Drive reports for the linked file;
-- 'sheet' = the assignment sheet's video_file column only). Admin-only:
-- the restricted role's column grants do not include them.
ALTER TABLE "narrative_assignments" ADD COLUMN "video_file" text;
--> statement-breakpoint
ALTER TABLE "narrative_assignments" ADD COLUMN "video_check" text;
--> statement-breakpoint
-- The same file may be loaded once as a real narrative and once as a
-- practice copy (dataset 'training'), so a file is unique per dataset.
ALTER TABLE "narratives" DROP CONSTRAINT "narratives_source_sha256_key";
--> statement-breakpoint
ALTER TABLE "narratives" ADD CONSTRAINT "narratives_source_sha256_dataset_key" UNIQUE ("source_sha256", "dataset");
