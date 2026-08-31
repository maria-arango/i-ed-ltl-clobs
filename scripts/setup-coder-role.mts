/**
 * Create/refresh the restricted Postgres role `clobs_coder` used by the
 * coder-facing query layer (docs/03-data-model.md §3, defense-in-depth
 * layer 2). Idempotent: re-run after every schema change so grants cover
 * new tables. It GRANTs narrowly and never grants on:
 *
 *   video_provenance, gold_scores, assignment_log, audit_log, exports,
 *   accounts, sessions, verification_tokens, coder_availability,
 *   certifications
 *
 * and on `videos` grants SELECT on named columns only — `is_gold` and the
 * unusable-flag audit columns are not among them, so even `select *` from
 * a coder connection fails rather than leaking.
 *
 * Password: taken from CODER_ROLE_PASSWORD env (CI) or generated; the
 * resulting DATABASE_URL_CODER is written into .env.local (never printed).
 *
 * Usage: node scripts/setup-coder-role.mts
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { Pool } from "pg";
import { hardenSslMode } from "../lib/pg-url.ts";

config({ path: ".env.local" });

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// Keep the existing password when one is already configured, so re-running
// for new grants never invalidates the DATABASE_URL_CODER that production
// (Vercel) is using. Priority: explicit env > current .env.local > new.
function existingPassword(): string | undefined {
  const current = process.env.DATABASE_URL_CODER;
  if (!current) return undefined;
  try {
    const u = new URL(current);
    return u.password ? decodeURIComponent(u.password) : undefined;
  } catch {
    return undefined;
  }
}
const password =
  process.env.CODER_ROLE_PASSWORD ??
  existingPassword() ??
  randomBytes(24).toString("base64url");

const pool = new Pool({ connectionString: hardenSslMode(adminUrl), max: 1 });

// Tables the coder layer may touch, with the verbs it needs. Nothing is
// ever DELETEd by a coder (CLAUDE.md §7 — nothing is destructive); soft
// deletes are UPDATEs. Citations are pure link rows, so removing one is a
// real DELETE and the single exception.
const GRANTS: Array<[string, string]> = [
  ["users", "SELECT (id, name, email, role, is_chief_coder, is_active)"],
  ["pairs", "SELECT"],
  ["pair_members", "SELECT"],
  [
    "videos",
    // UPDATE (status) only: completing a calibration marks the video
    // complete. Status is not disclosure; every other column stays closed.
    "SELECT (id, display_code, drive_url, duration_seconds, dataset, status, created_at), UPDATE (status)",
  ],
  ["assignments", "SELECT, UPDATE (status)"],
  ["assignment_raters", "SELECT"],
  ["observations", "SELECT, INSERT, UPDATE"],
  ["notes", "SELECT, INSERT, UPDATE"],
  ["scores", "SELECT, INSERT, UPDATE"],
  ["score_note_citations", "SELECT, INSERT, DELETE"],
  ["pupil_tallies", "SELECT, INSERT, UPDATE"],
  ["context_cards", "SELECT, INSERT, UPDATE"],
  ["context_adults", "SELECT, INSERT, UPDATE"],
  ["field_help", "SELECT"],
  ["calibration_sessions", "SELECT, INSERT, UPDATE"],
  ["calibration_presence", "SELECT, INSERT, UPDATE"],
  // UPDATE so a pair can revise a consensus before sign-off; after
  // completion the 0005 trigger refuses changes at the database level.
  ["calibration_items", "SELECT, INSERT, UPDATE"],
  ["calibration_signoffs", "SELECT, INSERT"],
  ["rubric_versions", "SELECT"],
  ["rubric_concepts", "SELECT"],
  ["rubric_indicators", "SELECT"],
  ["rubric_anchors", "SELECT"],
  ["rubric_examples", "SELECT"],
  ["rubric_guidance", "SELECT"],
  ["events", "INSERT"],
];

const client = await pool.connect();
try {
  const exists = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'clobs_coder'",
  );
  if (exists.rowCount === 0) {
    await client.query(
      `CREATE ROLE clobs_coder LOGIN PASSWORD '${password.replace(/'/g, "''")}'`,
    );
    console.log("Created role clobs_coder.");
  } else {
    await client.query(
      `ALTER ROLE clobs_coder LOGIN PASSWORD '${password.replace(/'/g, "''")}'`,
    );
    console.log("Role clobs_coder exists; password rotated.");
  }

  // Start from zero every run so a table removed from the list above loses
  // its grant instead of keeping it forever.
  await client.query(
    "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM clobs_coder",
  );
  await client.query("GRANT USAGE ON SCHEMA public TO clobs_coder");
  for (const [table, verbs] of GRANTS) {
    await client.query(`GRANT ${verbs} ON ${table} TO clobs_coder`);
  }
  console.log(`Granted on ${GRANTS.length} tables (and nothing else).`);
} finally {
  client.release();
  await pool.end();
}

// Write DATABASE_URL_CODER into .env.local (same host/db, swapped identity).
const url = new URL(adminUrl);
url.username = "clobs_coder";
url.password = password;
const coderUrl = url.toString();

const envPath = ".env.local";
let env = "";
try {
  env = readFileSync(envPath, "utf8");
} catch {
  /* no .env.local (CI) — skip writing */
}
if (env) {
  if (/^DATABASE_URL_CODER=/m.test(env)) {
    env = env.replace(/^DATABASE_URL_CODER=.*$/m, `DATABASE_URL_CODER=${coderUrl}`);
  } else {
    env += `\nDATABASE_URL_CODER=${coderUrl}\n`;
  }
  writeFileSync(envPath, env);
  console.log("DATABASE_URL_CODER written to .env.local (not shown).");
} else {
  console.log("No .env.local found; set DATABASE_URL_CODER yourself (CI does).");
}
