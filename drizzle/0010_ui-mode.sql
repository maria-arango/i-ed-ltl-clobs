-- Phase 3 (docs/08 §3, Amendment §46): which coder interface an account gets.
-- 'auto' = simple on phones and tablets, full on desktops (device classified
-- server-side); admins set 'simple' or 'full' to override.
CREATE TYPE "ui_mode" AS ENUM ('auto', 'simple', 'full');
ALTER TABLE "users" ADD COLUMN "ui_mode" "ui_mode" DEFAULT 'auto' NOT NULL;
