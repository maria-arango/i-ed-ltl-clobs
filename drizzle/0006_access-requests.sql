-- Amendment §35: self-service access requests from the sign-in page.
-- Requests never create accounts; an admin decides (training / live / no).
CREATE TYPE "access_request_status" AS ENUM ('pending', 'approved_training', 'approved_live', 'declined');

CREATE TABLE "access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "status" "access_request_status" DEFAULT 'pending' NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_by" uuid REFERENCES "users"("id"),
  "decided_at" timestamp with time zone
);

-- One live pending request per email.
CREATE UNIQUE INDEX "one_pending_request_per_email"
  ON "access_requests" (lower("email")) WHERE "status" = 'pending';
