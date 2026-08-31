/**
 * CODER query layer — the ONLY module coder-facing route handlers may use
 * to reach the database (docs/03-data-model.md §3).
 *
 * Design, enforced as coder routes are built:
 * - Connects as the restricted Postgres role (DATABASE_URL_CODER) that has
 *   no SELECT grant on video_provenance, gold_scores, assignment_log,
 *   audit_log, or exports — a bug here returns a permission error, not data.
 * - Exports only whitelisted, typed queries. No raw db handle leaves this
 *   module, and nothing here ever selects school, arm, teacher identifiers,
 *   raw filenames, is_gold, or another coder's unreleased work.
 * - Every query filters by the acting coder's id and stamps `dataset`
 *   server-side from the account, never from the client.
 *
 * The role itself is created in the migration step that ships the first
 * coder-facing route; until then this module exposes nothing.
 */

export {};
