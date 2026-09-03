-- Stage 4 exports (addendum §12, docs/03-data-model.md §4.9).
-- The generated files of every export are stored verbatim so an admin can
-- re-download any past export UNCHANGED. Regenerating would not be the same
-- artifact once anything is voided or reassigned.
CREATE TABLE "export_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "export_id" uuid NOT NULL REFERENCES "exports"("id"),
  "filename" text NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "sha256" text NOT NULL,
  "content" bytea NOT NULL
);

CREATE UNIQUE INDEX "one_filename_per_export" ON "export_files" ("export_id", "filename");
