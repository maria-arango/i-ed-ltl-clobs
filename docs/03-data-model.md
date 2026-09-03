# 03 — Data model

- **Status:** for approval
- **Method:** built backwards from the export contract in `docs/01-addendum.md` §12, as amended by
  §17 Amendments A and B. Every export column is traced to a stored field; nothing in an export is
  inferred at read time.
- **Engine:** PostgreSQL (Neon), schema and migrations in Drizzle ORM, committed to the repo.
  The `dataset` column (ADR 0001) is in the **first migration**, on every table that holds
  coder-generated or assignment content.

Conventions: every table has a UUID `id` primary key and `created_at` unless stated; user-generated
content tables also carry `updated_at` and a soft-delete `deleted_at` (nothing is destructive,
CLAUDE.md §7). Append-only tables (`events`, `audit_log`, `assignment_log`) have no update or delete
path at all.

---

## 1. The export contract, restated as the target

The exports (addendum §12 + Amendments A and B), in CSV and Stata `.dta` with variable/value labels, plus a
machine-readable codebook. Every export carries timestamp, row counts, and rubric version; past exports
are re-downloadable unchanged; identifiers are stable across exports.

| Export | Grain | Fed by |
|---|---|---|
| `clobs_scores_long` | video × item × rater (individual or consensus) | `scores`, `calibration_items`, `observations`, `videos`, `video_provenance`, `assignments` |
| `clobs_scores_wide` | video (consensus per item as columns) | derived from the same, at export time |
| `clobs_context_cards` | **video** — one row, adults flattened into `A1_…A6_` blocks matching `context_cards_v3.xlsx` (Amendment B) | `context_cards`, `context_adults` |
| `clobs_notes` | note entry | `notes`, `observations` |
| `clobs_events` | raw event | `events` |
| `clobs_assignments` | assignment/reassignment action | `assignment_log` (incl. `fills_context_card`) |
| `clobs_calibration` | video × item | `calibration_items`, `calibration_sessions`, `calibration_signoffs` |

Exports filter to `dataset = 'live'` through the one shared query layer (ADR 0001), with a test that no
export path can emit a non-live row.

---

## 2. Entity overview

```
users ──< coder_availability
users ──< pair_members >── pairs
videos ──1 video_provenance          (admin-only: raw id, school, arm, teacher assignment)
videos ──< assignments >── pairs
assignments ──< assignment_raters    (per-coder duty, incl. fills_context_card)
assignment_log                       (append-only history, seeds + reasons)
videos ──< observations >── users    (one per rater × video; n raters supported)
observations ──< notes
observations ──< scores ──< score_note_citations >── notes
observations ──< pupil_tallies
videos ──1 context_cards ──< context_adults
videos ──< calibration_sessions ──< calibration_items, calibration_signoffs
videos ──< gold_scores               (admin-only)
users ──< certifications
rubric_versions ──< rubric_concepts ──< rubric_indicators, rubric_anchors, rubric_examples
rubric_versions ──< rubric_guidance  (guiding rules + reach bands)
field_help                           (context-card inline instructions, versioned)
events, audit_log, exports           (append-only)
```

---

## 3. Blinding: where the school/arm mapping lives and why coders can't reach it

**The only tables that know school, arm, or teacher assignment are `video_provenance` and (implicitly,
via master scores) `gold_scores`. The raw video ID exists only in `video_provenance`.** The coder-visible
`videos` table contains nothing derivable to school or arm — not even an ordering artifact: `display_code`
is assigned from a shuffled sequence, so `V-0417` says nothing about import order or school grouping.

Enforcement is layered, server-side (CLAUDE.md §2), each layer independently tested:

1. **Table separation.** Provenance is a separate table joined only in admin code. No coder-facing
   query ever selects from it; there is no relation defined from `videos` to `video_provenance` in the
   coder schema object, so the ORM cannot lazily wander into it.
2. **Two database roles (defense in depth).** Neon lets us create a second Postgres role,
   `clobs_coder`, with **no SELECT grant** on `video_provenance`, `gold_scores`, `assignment_log`,
   `audit_log`, or `exports`. All coder-facing request handlers use a connection as that role
   (`DATABASE_URL_CODER`); admin handlers use the full role. Even a bug in application code then
   returns a Postgres permission error, not data.
3. **One query layer per audience.** `lib/db/coder.ts` exports only whitelisted, typed queries; coder
   route handlers may import only from it (enforced by a lint rule in CI). `lib/db/admin.ts` requires
   an admin session re-check inside every function.
4. **API-layer blinding tests** (the CLAUDE.md testing floor), run against seeded data:
   - no coder-facing endpoint's JSON, error body, or redirect URL contains `school`, `arm`,
     `teacher_assignment`, a raw video ID pattern (`^\d{5}_\d+`), or another coder's user id where not allowed;
   - partner scores/justifications/notes for a shared video return 403 until that video's calibration
     session has been **opened by both parties**;
   - the context card of a shared video returns 403 to the non-authoring coder until that coder's own
     scores for the video are submitted (Amendment A);
   - gold videos are indistinguishable from ordinary videos in every coder-facing payload.

---

## 4. Tables

### 4.1 People and access

**`users`** — `id`, `email` (unique), `name`, `role` ∈ {`admin`, `coder`} (Amendment B: "enumerator",
"coder" and "observer" are one role), `is_chief_coder` (boolean — a coder approved to anchor a pair),
`dataset_scope` ∈ {`live`, `test`, `training`} (stamped onto every row this account writes —
server-side, never from the client; `training` is what makes an account a **trainee**), `is_active`,
`deactivated_at`, `deactivated_reason`. Auth.js adds its own `sessions` and `verification_tokens`
tables (email one-time codes; idle timeout and re-auth for admin screens are session policy, not
schema). Accounts are created by an admin entering an email + role on the Team screen; the person
signs in with the emailed code — there is no self-signup. Role and scope changes are admin actions,
recorded in `audit_log`.

**`coder_availability`** — `user_id`, `fte_fraction` (0–1), `effective_from`, `effective_to` (null =
open). Weekly capacity targets are derived from this, never assumed (addendum §6). History preserved by
adding rows, not editing.

**`pairs`** — `id`, `label`, `dataset`, `formed_at`, `dissolved_at`, `dissolved_reason`.
**`pair_members`** — `pair_id`, `user_id`, `joined_at`, `left_at`. A pair normally has two active
members; membership rows make regrouping non-destructive and keep history. **Pairing rule (Amendment
B), enforced on pair creation and tested:** every pair contains exactly one anchor (admin or
chief-coder) and one enumerator — never two enumerators, never two admins.

### 4.2 Videos and provenance

**`videos`** (coder-visible fields only) — `id`, `display_code` (unique, `V-0417`, assigned from a
seeded shuffle at import), `drive_url` (or Drive file id), `duration_seconds` (nullable),
`dataset`, `status` ∈ {`pool`, `assigned`, `in_progress`, `complete`, `unusable`, `void`},
`is_gold` — **stored here but never serialized to coders** (and invisible under the `clobs_coder`
role via a column grant; if column-level grants prove awkward in practice, `is_gold` moves to an
admin-only `gold_videos` table — decided at implementation, both keep the guarantee).

Unusable flow (addendum §3): `unusable_reason`, `unusable_flagged_by`, `unusable_flagged_at`. Marking
unusable returns the video to the admin queue and removes it from denominators; completed partial work
is preserved.

**`video_provenance`** (admin-only) — `video_id` (unique FK), `raw_filename`
(`11002_11002_29_11_EAST_BIOLOGY_comp.mp4`), **`sid`** (school ID, `11002`), **`tr_id`** (teacher ID,
`11002_29`), `arm` ∈ {`control`, `dispersed`, `connected`}, `teacher_assignment`, `subject`,
`recorded_year`, `imported_at`, `import_batch`, `excluded` (boolean) + `excluded_reason` (Amendment B:
lessons taught in Arabic, Kiswahili, Lusoga, Luganda, or French are excluded from coding at import).
Loaded from `00_selected_teachers_rand.dta` admin-side. **This table is the display-code ↔ true-ID
crosswalk**: `sid` and `tr_id` appear in every admin export and nightly backup; coders refer to videos
only by `display_code`, including between themselves and in calibration.
(`subject` is duplicated into the context card by the coder observationally; the provenance copy is for
the assignment algorithm's balance constraint and the export only.)

### 4.3 Assignment

**`assignments`** — `id`, `video_id`, `pair_id`, `wave_no`, `dataset`,
`priority_batch_flag` (default false; only true for an explicitly defined early batch, addendum §6),
`batch_label` (nullable text — the admin recode set is `recode-2026` per Amendment B, so it is
identifiable in every export), `status` ∈ {`active`, `returned`, `voided`, `completed`},
`status_reason`, `assigned_at`, `assigned_by`.

**`assignment_raters`** — `assignment_id`, `user_id`, `fills_context_card` (boolean; **exactly one true
per assignment**, enforced by a partial unique index and a test — Amendment A), `previously_coded`
(boolean — true for an admin recoding a video they coded under the old rubric, so prior exposure is
visible in the analysis), `status` ∈ {`active`, `transferred`, `voided`}, `status_reason`. n raters per
video is the model; a pair is the normal case, so a third rater is one more row, not a migration
(addendum §3).

**`assignment_log`** (append-only) — `id`, `action` ∈ {`assign`, `reassign`, `return_to_pool`, `void`,
`transfer_card_duty`}, `video_id`, `from_pair_id`, `to_pair_id`, `from_user_id`, `to_user_id`,
`fills_context_card`, `seed`, `algorithm_version`, `wave_no`, `reason`, `actor_id`, `occurred_at`.
This table **is** `clobs_assignments`: the randomisation is auditable and reproducible from `seed` +
`algorithm_version` + the pool state at `occurred_at`.

The algorithm itself (Stage 3): seeded PRNG; blocks on arm within each wave; balances arm × school ×
subject × teacher-assignment within each coder and each pair; no same-school runs; spreads each school
across coders; context-card duty randomised at the same time from the same seed, balanced to ~half
within each coder's queue *and* within each pair. Balance properties and seed-reproducibility are
tested (CLAUDE.md testing floor).

### 4.4 The observation (one coder × one video)

**`observations`** — `id`, `video_id`, `coder_id`, `assignment_rater_id`, `dataset`, `status` ∈
{`not_started`, `in_progress`, `submitted`}, `started_at`, `submitted_at`, `n_sessions` (derived from
events at submit, stored for the export), `rubric_version_id` (stamped when scoring starts),
`is_seeded_recheck` (drift checks, addendum §9 — admin-only in serialization, like `is_gold`).
Section completion (notes / scores / context card where applicable) is derived state, shown per section.

**`notes`** — `id`, `observation_id`, `video_timestamp_seconds` (nullable — the free-text path exists,
but timestamped entry is the default, addendum §5), `body`, `created_at`, `updated_at`, `deleted_at`.
Autosaved locally and synced; ordering by timestamp then created_at.

**`scores`** — `id`, `observation_id`, `item_no` (1–8), unique on (`observation_id`, `item_no`), and
the fixed encoding stored as **three separate fields, never inferred** (CLAUDE.md §4):
`score_num` (1–4), `score_column` (`A`/`B`), `score_degree` (`somewhat`/`very`), with a CHECK
constraint that the triple is one of the four legal combinations
(1=A/very, 2=A/somewhat, 3=B/somewhat, 4=B/very) — the check keeps writes honest; reads never re-derive.
Plus `justification`, `rubric_version_id`, `submitted_at`, `locked_at`. **Lock rule:** on observation
submission, `locked_at` is set and any later UPDATE is refused by a trigger and by the query layer
(CLAUDE.md §6). There is no "blank" score row — an unentered item simply has no row (that is the
"not yet entered" state; "cannot be coded" is the video-level unusable flag, never a score value).

**`score_note_citations`** — `score_id`, `note_id`. Attaching one's own note entries to a
justification is **available but never required or prompted** (Amendment B): the norm that a Column B
score needs a concrete moment is carried by training, not by the interface. When citations exist, the
export carries the cited timestamps.

**`pupil_tallies`** — `id`, `observation_id`, `label`, `count`, `updated_at`. The reach-scale counting
tool (addendum §4); cheap, coder-private, exported with notes if useful.

### 4.5 Context card (Amendment A: one per video; Amendment B: no scenes)

**`context_cards`** — `id`, `video_id` (unique), `authored_by` (coder), `dataset`, `status` ∈
{`draft`, `submitted`}, `submitted_at`, then the general fields, held **once per video**: `subject`,
`composition` ∈ {`all_boys`, `all_girls`, `mixed`}, `approx_count` (free text: a number, a range, or
`unknown` — matching the instrument), `uniforms`, `appearance_caveats`, `room`, `camera`, `notes`,
`timeline`, and `setting_change` (free text, usually empty — used only in the rare case the recording's
setting changes mid-video, e.g. "recording pauses at 21:40 and resumes in a different room; from there
the board is on the left"; this replaces the per-scene rows of the pilot file). Plus the confirmation
step (Amendment A, adopted): `confirmed_by`, `confirmed_at`, `flagged` (bool), `flag_reason`,
`flag_resolved_by`, `flag_resolved_at`.

**`context_adults`** — `id`, `context_card_id`, `adult_no` (1–6, unique per card), `role` ∈
{`teacher`, `camera_operator`, `other`}, `sex` ∈ {`male`, `female`, `unknown`}, `clothing`,
`clothing_caveats`, `features`, `behavior`, `speaks` ∈ {`yes`, `no`}. Adults are a child table only
because the form needs add/remove rows; **the export flattens them** into `A1_role … A6_speaks`
columns so `clobs_context_cards` is a single table, one row per video, in exactly the shape of
`context_cards_v3.xlsx` that the AI-training pipeline was designed around (Amendment B).

**`field_help`** — `form` (`context_card`), `field_key`, `help_text`, `version`, `active`. The
field-instruction row from `context_cards_v3.xlsx` becomes seeded data rendered as inline help — data,
not hard-coded strings, so the team can amend wording without a deploy.

### 4.6 Calibration

**`calibration_sessions`** — `id`, `video_id`, `pair_id`, `dataset`, `status` ∈ {`scheduled`, `lobby`,
`open`, `completed`, `voided`}, `opened_by` (array/join of the two coder ids with per-coder
`opened_at` in **`calibration_presence`**: `session_id`, `user_id`, `joined_at`, `left_at`),
`completed_at`, `rubric_version_id`. **The session moves to `open` only when both assigned coders have
an active presence row** — that transition is the server-side gate the blinding tests exercise: before
it, neither coder's API can return the other's scores or justifications.

**`calibration_items`** — `session_id`, `item_no` (unique per session), `coder_a_score_id`,
`coder_b_score_id` (FKs to the locked individual `scores` rows — the export reads both sides from here),
`final_score_num` / `final_score_column` / `final_score_degree` (same triple + CHECK as `scores`),
`resolution` ∈ {`agreed`, `a_moved`, `b_moved`, `both_moved`} (computed at save from the three values,
stored for the export's "who moved"), `consensus_rationale` (required when the two individual scores
differed). Only the **revised/agreed** score is stored; averages are computed at analysis time
(addendum §3, confirmed). **There is no escalation path (Amendment B):** every item must reach a
consensus before sign-off — an anchor (admin or chief-coder) is present in every pair, so adjudication
is built into the room, and an escape hatch would invite over-use.

**`calibration_signoffs`** — `session_id`, `user_id`, `signed_at`, `ip_address`, `user_agent`. Both
signatures complete the session; afterwards the session and its items are **immutable** (trigger + query
layer, like score locking). If something truly cannot be resolved, the admin-side remedy is voiding the
session with a reason and rescheduling — appended, never edited.

### 4.7 Gold standard and certification (addendum §9)

**`gold_scores`** (admin-only) — `video_id`, `item_no`, score triple + CHECK, `rationale`,
`rubric_version_id`, `entered_by`, `entered_at`. Master scores for gold videos.

**`certifications`** — `user_id`, `attempt_no`, `status` ∈ {`in_progress`, `passed`, `failed`},
`threshold_spec` (jsonb: the rule applied), `result_stats` (jsonb: exact/adjacent agreement, weighted
kappa vs. master), `decided_at`. A coder without a passing row cannot receive live assignments
(enforced in the assignment algorithm, tested). Seeded re-checks reuse `observations.is_seeded_recheck`
and are compared to `gold_scores` on the admin dashboard.

### 4.8 Instrument (rubric as data, versioned)

**`rubric_versions`** — `id`, `version_label` (e.g. `2026-08-22`), `source_ref` (the .tex commit),
`effective_from`, `notes`. **`rubric_concepts`** — `rubric_version_id`, `item_no` (1–8), `name`,
`statement`, `importance`, `special_note`. **`rubric_indicators`** — `concept_id`, `position`, `text`.
**`rubric_anchors`** — `concept_id`, `score_num` (1–4), `text`. **`rubric_examples`** — `concept_id`,
`score_num`, `position`, `text`. **`rubric_guidance`** — `rubric_version_id`, `kind` ∈
{`guiding_rule`, `reach_band`}, `position`, `label`, `text` (the front-matter coding rules and the
shared four-band reach scale, surfaced at the moment of scoring — addendum §4).

Content is seeded from a structured JSON generated once from `20260822_CLOBS.tex` (script committed,
output reviewed by you against the PDF). A rubric edit = a new version row set; old scores keep their
`rubric_version_id` and exports carry it, so pre- and post-edit scores are never silently pooled.

### 4.9 Instrumentation, audit, exports

**`events`** (append-only; replaces the timer, addendum §8) — `id`, `user_id`, `dataset`,
`video_id` / `observation_id` / `session_id` (nullable), `kind` (e.g. `item_opened`, `first_keystroke`,
`score_selected`, `score_changed`, `item_completed`, `focus_lost`, `focus_regained`, `idle_start`,
`idle_end`, `submit`, `sync_recovered`), `payload` (jsonb), `occurred_at`. Time-on-task is derived at
export, never shown as a countdown. Rows older than 60 days are deleted **only after** the nightly
backup has written them to Drive (ADR 0001 — the roll-off is not optional).

**`audit_log`** (append-only) — `id`, `actor_id`, `action` (assignment change, role change, export
download, unblinding view, test-data purge, adjudication…), `subject_table`, `subject_id`, `details`
(jsonb), `occurred_at`.

**`exports`** — `id`, `requested_by`, `requested_at`, `dataset` (always `live`), `rubric_version_id`,
`row_counts` (jsonb per table), `manifest` (jsonb), `drive_file_ids` (jsonb). **`export_files`**
(migration 0007, 2026-09-03) — `export_id`, `filename`, `content_type`, `byte_size`, `sha256`,
`content` (bytea): the generated files stored verbatim, so any past export is re-downloadable
**unchanged** (re-serving the stored artifact, never regenerating). The nightly Drive backup will mirror
them (`drive_file_ids`); Drive is never the only copy. Stable identifiers across exports = the UUIDs and
display codes above, which never change once created. The contract (tables, columns, types, labels,
codes) is `lib/export/contract.ts`; see addendum Amendment §39.

---

## 5. Column-by-column: `clobs_scores_long` traced to storage

The most important export, one row per video × item × rater:

| Export column | Source |
|---|---|
| `video_id` | `video_provenance.tr_id` + raw filename (admin export only — this file is unblinded by design) |
| `display_code` | `videos.display_code` |
| `sid`, `tr_id`, `arm`, `teacher_assignment` | `video_provenance` (Amendment B: `sid` and `tr_id` are in every admin export and backup) |
| `item_no`, `item_name` | `scores.item_no` + `rubric_concepts.name` (via the row's `rubric_version_id`) |
| `rater_type` | `individual` (from `scores`) or `consensus` (from `calibration_items`) |
| `coder_id` | `observations.coder_id` (stable pseudonymous id; null for consensus rows) |
| `score_num`, `score_column`, `score_degree` | stored triple, verbatim |
| `justification` | `scores.justification` / `calibration_items.consensus_rationale` |
| `cited_timestamps` | `score_note_citations` → `notes.video_timestamp_seconds`, semicolon-joined |
| `submitted_at`, `n_sessions` | `observations` |
| `minutes_on_item` | derived from `events` at export time (documented formula in the codebook) |
| `rubric_version` | `scores.rubric_version_id` → `rubric_versions.version_label` |
| `gold_flag` | `videos.is_gold` |
| `priority_batch_flag` | `assignments.priority_batch_flag` |
| `dataset` | row-level, always `live` in exports (tested) |

`clobs_scores_wide` pivots the consensus rows of the same query. The codebook (machine-readable JSON +
human `.md`, plus Stata labels in the `.dta`) is generated from the schema and the rubric version, and
the export contract — names, types, row counts — has its own test fixture (CLAUDE.md testing floor).

---

## 6. What deliberately does NOT require a migration later

- A third rater → one more `assignment_raters` / `observations` row.
- Rotating vs. fixed pairs → `pair_members` history already models it.
- Rubric edits → new `rubric_versions` rows.
- Gold set, seeded re-checks, certification → present from the first migration even though the gate
  ships in Stage 3.
- Test/training sandboxes → `dataset` column from day one; purge deletes `test`, preserves `training`.
- Phases 2–3 (calibration, dashboards, embedded playback) read the Phase-1 schema; nothing is reshaped.
