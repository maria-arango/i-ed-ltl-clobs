# 08 — Next steps after the team meeting (2026-09-03): what, why, in what order

> Status: **proposal for María and the team.** Nothing in here is built yet except where marked
> "already exists". Once the team agrees, each phase becomes one branch and one pull request, and
> every decision becomes a numbered Amendment in `docs/01-addendum.md` §17.

## 0. The short version

The notes from the team meeting fall into four kinds of work, and the order matters:

| Order | Kind | Why this position |
|---|---|---|
| **Phase 1** | Quick fixes and answers (half a day) | Small, certain, unblock the team's review; nothing else depends on them being later. |
| **Phase 2** | Data-model decisions (context card by both coders, timed sections, single-sitting sessions) | Everything after this reads or writes these tables. Deciding them first avoids building the simple interface twice. |
| **Phase 3** | The simple (ODK-like) coder interface as a **clickable prototype** on demo data, with device detection and an admin "preview as coder" switch | The biggest change and the one the team must see before committing. Prototype first, decide, then finish. |
| **Phase 3b** (parallel) | Video embedding test with the 46 Drive links, on real phones and tablets | A one-day experiment; its result shapes the prototype's video screen. |
| **Phase 4** | Data flowing to the Harvard Drive automatically | Independent of the interface; reuses the backup design already agreed in ADR 0001 and the service account that already exists. |
| **Phase 5** | Everything else already queued (Team-screen hook for departures, void a calibration session, Stage 5 backup drill, weekly calendar) | Unchanged. |

Sections 1 to 5 detail each phase with the steps. Section 6 answers the questions in the notes
(events table, the wide file's columns, special characters, Drive as a database, embedding).

---

## 1. Phase 1 — quick fixes (one branch, one PR)

| # | Change | Where | Notes |
|---|---|---|---|
| 1.1 | Rubric description becomes a **closed-by-default disclosure** in the scoring panel: a clickable rectangle "Show the rubric for this concept" that opens the indicators / anchors / examples. Remembers open/closed per coder in the browser. | `components/workspace/scoring-panel.tsx` | Keeps DESIGN_SYSTEM §4: the chips themselves stay motionless; only the disclosure animates (height, 200 ms, reduced-motion safe). |
| 1.2 | **"See all my scores as a table" visible from the first second**, not only after the justification box has been touched. | same | A rendering-order bug. |
| 1.3 | **Remove "Subject" from the context card form**. The column stays in the database and export (the mapping file's subject is already exported as `mapping_subject`), the field simply disappears from the form and from the "card cannot be empty" rule (Amendment §33 becomes composition + count + one adult). | `context-card-form.tsx`, `lib/db/coder.ts` | Records as an Amendment. |
| 1.4 | **Remove "What Arya can see"**; replace with a general admin **"Preview as coder"** switch (see 3.5) that any admin can use for any coder account and for either interface. | `app/(shell)/admin/preview`, home button | The read-only mirror through the restricted layer is the right mechanism; it just needs to be general. |
| 1.5 | **CSV encoding fix**: write a UTF-8 byte-order mark at the start of every `.csv`. This is what makes Excel and Numbers read "María José" correctly; the `.dta` is already correct (Stata 14+ is UTF-8). See §6.3 for why restricting characters is the wrong fix. | `lib/export/csv.ts` + contract test | One line. |
| 1.6 | **Rename the wide file's columns** to self-explaining names: `c1..c8` → `consensus_item1..8`, `a1..a8` → `anchor_item1..8`, `b1..b8` → `enumerator_item1..8`. | `lib/export/contract.ts` | The codebook already labels them; the names should not need the codebook. |
| 1.7 | **Data dictionary in the app**: a "Data dictionary" section on the Exports screen that renders the contract (every table, every column, type, label, codes) so nobody has to open `codebook.md`. Also a downloadable `data_dictionary.csv` in every export. | `app/(shell)/admin/exports` | The contract already is the dictionary; this only shows it. |
| 1.8 | Copy pass on `clobs_events` in the codebook so §6.1 below is stated there too. | `lib/export/codebook.ts` | |

Definition of done: tests green (contract test updated for 1.5–1.7), María confirms 1.1/1.2 on the demo video.

---

## 2. Phase 2 — data-model decisions to take before the new interface

These change tables that the simple interface will write to. Each needs an Amendment; the
schema changes are small but they should land **before** Phase 3 so the prototype writes real data.

### 2.1 Both coders fill the context card (reverses Amendment A's "one card per video")

- `context_cards` uniqueness becomes **(video_id, authored_by)** instead of video_id. Two rows per video.
- `assignment_raters.fills_context_card` becomes always true for new assignments; the card-duty
  balancing in the wave algorithm (Amendment A) is switched off (the code stays, disabled, so the
  history of past waves remains reproducible). The "card" marker on the Assignment screen goes.
- The confirm / flag second pass (Amendment A) becomes unnecessary: each coder writes their own
  card. Remove the ReviewPanel from the coder flow; keep the columns.
- Blinding rule stays: a coder never sees the partner's card before submitting their own scores;
  after both have submitted, both cards are visible in the calibration room side by side.
- Export: `clobs_context_cards` becomes **one row per video × coder** with `coder_id` and
  `coder_pair_role` (anchor / enumerator). Amendment B §1's "single table with A1–A6 blocks" stands;
  only the row unit changes. The codebook says so.
- Side effect that this fixes: the handoff noted a trainee's training card blocking the live card
  slot of a gold video; with card-per-coder that conflict disappears.
- Migration: add the new unique index, drop the old one, backfill nothing (existing cards keep
  their author). Reassignment ("Move work") no longer re-authors cards: each coder's card is theirs.

### 2.2 Timed sections: start and end of the context card and of scores + justifications

New table **`section_sessions`**: `id, observation_id, section ('context_card' | 'scores' |
'notes'), started_at, ended_at, end_reason ('submitted' | 'closed' | 'abrupt' | 'admin_released'),
resume_reason (text, filled by the coder when a previous sitting ended abruptly), device
('phone' | 'tablet' | 'desktop'), dataset`. One row per sitting; the export `clobs_sections` gives
start, end, minutes, and the reason chain per coder × video × section, which is exactly the
ODK/SurveyCTO "section time" the team asked for. The `events` log stays as the fine-grained record
underneath (see §6.1); `minutes_on_item` keeps its formula.

### 2.3 Single-sitting sessions and the "why were you cut off?" step

- **Starting a video** ("Do you want to start this video?") writes `observations.started_at` and
  sets a per-coder **active video**. While one is active, the queue shows the others greyed with
  "Finish V-0417 first". An admin can release the lock from Progress (recorded, with reason).
- **Starting a section** (card, scores) opens a `section_sessions` row. Autosave keeps working as
  today (local mirror + sync), so a dropped connection or a dead battery loses nothing.
- **Detecting an abrupt end**: a heartbeat every 30 s while a section is open; a row whose
  heartbeat is older than 2 minutes and has no `ended_at` is marked `abrupt` the next time that
  coder opens anything. The coder then sees "Your last sitting on V-0417 ended unexpectedly. What
  happened?" with a required short reason (chips: network / battery / interrupted / other + text)
  before the section reopens exactly where it was.
- Risk to state plainly: locking coders to one video at a time will bite when a Drive link is
  broken or a video is unusable mid-way. Mitigation: the coder can flag "problem with this video"
  (existing `unusable` path) which releases the lock and notifies admins.

### 2.4 Amendments to write once agreed

§42 card by both coders, §43 timed sections, §44 single-sitting + abrupt-end reason, §45 subject
removed from the card form, §46 the simple/advanced interface pair (Phase 3).

---

## 3. Phase 3 — the simple interface (ODK-style) as a prototype first

### 3.1 What it is

A second **coder-facing layout** that reuses the same restricted data layer, the same API routes,
the same blinding rules and the same design tokens (Newsreader / Inter / JetBrains Mono, paper and
card surfaces, the score ramp, 280 ms slides), but arranged like an ODK Collect form: one thing per
screen, big tap targets, a progress line at the top, "Next" at the bottom, minimal reading.

The current workspace becomes the **advanced** layout. Both exist; a coder's account carries a
preference (`ui_mode: 'simple' | 'advanced' | 'auto'`, default `auto`), an admin sets it on the
Team screen, and the coder can switch in their own menu if the admin allows it.

### 3.2 Device detection

On every request the server reads the browser's user agent and viewport hints (`headers()` in Next),
classifies phone / tablet / desktop, and with `ui_mode = 'auto'` serves simple on phone and tablet,
advanced on desktop. The classification is stored on each `section_sessions` row (2.2) so the
analysis can control for device. A coder who logs in from a computer but is set to `simple` gets
the simple layout, as the notes ask.

### 3.3 The simple flow, screen by screen (the prototype builds exactly this on demo data)

1. **Sign-in** — unchanged (email, code). Kimanya photo stays.
2. **My week** — the assigned videos grouped by day of the week the wave planned them for, each a
   large card: display code, "Not started / In progress / Done", partner's first name. One video
   can be active; the rest wait.
3. **Start** — "Do you want to start V-0417?" Yes / Not now. Yes marks the start (2.3).
4. **Video hub** — the Drive link as a big button ("Watch in Drive") and, if embedding works (3b),
   a "Watch here" button that opens the theatre; three tiles below: **Context card**, **Notes**,
   **Scores and justifications**, each with its state and, for card and scores, "Start" / "Continue".
5. **Context card** — one question per screen, ODK style: composition, count, uniforms, room,
   camera, timeline, then adults one at a time ("Add another adult?"). Submit at the end.
6. **Notes** — the same rich editor, full screen, big toolbar, timestamp stamp button.
7. **Scores** — one concept per screen: the concept name, the collapsible rubric (Phase 1.1), four
   large score buttons in the ramp colours, the justification box, Next. Screen 9 is the review
   table (Amendment §31), then Submit with the lock warning.
8. **Calibration** — the queue and the room already fit a tablet; on a phone the room stacks
   (my score / partner's score / consensus chips / rationale) one item per screen with a progress
   line. Co-presence rule unchanged.
9. **Done** — the moment card; back to My week.

### 3.4 Prototype before product

- Build the nine screens as a working prototype under `app/(simple)/…` reading the **training
  dataset** (demo videos), so the team taps through it on their own phones and tablets at the
  meeting. Aesthetic fidelity matters here (this is what they will judge), data fidelity comes
  from the real API, so nothing is faked.
- Size targets: 360 × 740 phone (Pixel-class) and 1024 × 768 / 800 × 1280 tablet (24 × 16 cm ≈ 10").
  Touch targets ≥ 44 px, text ≥ 16 px on phone, no horizontal scroll. Audit with the existing
  Playwright viewport script.
- The meeting decides: simple only, advanced only, or both with `auto`. The plan assumes both.

### 3.5 Admin "preview as coder" (replaces "What Arya can see")

On the Team screen, each coder row gets "Preview as": **simple** / **advanced**. It renders the
chosen layout through the restricted coder layer for that account, read-only, with a banner
"Previewing as Arya — nothing you do here is saved". Any admin, any coder, both layouts. This is
also how María shows the two versions to the team from her own login.

### 3.6 Estimated effort

Prototype on demo data: about three working days. Finishing after the decision (real data, lock
and abrupt-end logic, calibration on phone, tests): about a week.

---

## 3b. Phase 3b — video embedding experiment (46 Drive links, one day)

### What is technically true

- Google Drive can embed a video with an iframe at `https://drive.google.com/file/d/FILE_ID/preview`.
  The platform already stores links like `https://drive.google.com/file/d/FILE_ID/view`; the file id
  is the segment after `/d/`, so the 46 links need no extra work.
- The embed plays **only if the viewer's browser is signed into a Google account that has access to
  the file**, and it relies on Google's cookies being sent inside our page (a "third-party cookie").
  Chrome on Android and desktop currently allow this; **Safari on iPhone and iPad blocks third-party
  cookies by default**, so the embed there often shows "You need access" or a blank frame even when
  the person does have access. That is the single fact that decides whether theatre mode is a
  feature or an enhancement.
- Inside the Drive player the coder gets play/pause, seek, speed (in the player's own menu), and
  fullscreen. Our page **cannot read the current time** from the Drive player, so "copy the current
  timestamp into a note" cannot be built on the embed; the manual "stamp current time" stays.
- The alternative (streaming the file through our own server with a normal `<video>` element) would
  route every byte of Level-3 video through Vercel, needs long-running functions and large
  bandwidth, and is out of scope for the free tier and for the data-governance rules. Not proposed.

### The experiment

1. Add a "Watch here" button on the workspace (advanced) and the video hub (simple) that opens a
   theatre panel with the iframe; "Watch in Drive" stays beside it (the notes ask for both).
2. Test the 46 linked videos on: an Android phone (Chrome), an iPad (Safari and Chrome), a Windows
   laptop (Chrome, Edge), a Mac (Safari). Record play / no play per device in a table in this file.
3. If Safari fails as expected: theatre mode ships as an enhancement with a graceful fallback
   ("This video will not play inside the platform on this device. Open it in Drive.") and the
   training says "Android or Chrome". If it fails everywhere, drop the embed and keep the link.
4. Recording durations: when a video plays in the embed we still cannot read its length; durations
   continue to come from the file metadata at the Drive-link attachment step.

---

## 4. Phase 4 — data reaching the Harvard Google Drive automatically

### 4.1 Should Drive (or Google Sheets) BE the database? No, and here is why

The quoted text is accurate about what is *possible*, and it also names the reason not to do it:
Drive and Sheets are file stores, not databases. What the platform relies on every minute would
break:

| Needed by the study | Postgres (now) | Sheets / Drive files |
|---|---|---|
| Two coders saving at the same second | transactions, no lost writes | last write wins, silent loss |
| "Locked scores can never change" | enforced by a database trigger (migrations 0002/0003) | a script rule anyone with the file can bypass |
| Blinding (coders never read school / arm / partner rows) | a restricted database role that physically cannot read those tables | a sheet is all-or-nothing; row-level secrecy is not available |
| Calibration co-presence gate, autosave every few seconds | milliseconds | Sheets API quotas (about 60 writes per minute per user) would throttle 14 coders |
| Audit log, immutable calibration records | database triggers | none |

On the "fewest intermediaries" concern: the data already passes through exactly one processor,
Neon (Postgres hosted on AWS, encrypted in transit and at rest). Google Sheets would replace that
one intermediary with another (Google), not remove it. The Harvard Drive's protections apply to
files at rest in Drive; a Sheets-as-database design would put the live working data in Google's
API layer instead, which is not safer.

### 4.2 What to build instead: the working data lands in the Harvard Drive, automatically, often

This is ADR 0001's backup design, made more frequent and made visible:

1. **A scheduled job** (GitHub Actions cron; the repository already runs Actions) runs every night
   at 02:00 Kampala time, and additionally every time an admin generates an export.
2. It calls the same `createExport` used by the Exports screen (so the files are the contract ones,
   with codebook and checksums), then **uploads the file set to the Harvard shared Drive folder**
   `…/Classroom-Observations/_platform-backups/YYYY-MM-DD/` using the Google service account that
   already exists (`clobs-backup@ltl-clobs-backup.iam.gserviceaccount.com`, editor on that folder).
   The service account key is a GitHub Actions secret, never in the repository. `exports.drive_file_ids`
   records what went where, so the Exports screen can link straight to Drive.
3. **Optionally a live Google Sheet** in the same folder, `CLOBS — live tables`, with one tab per
   export table, **overwritten** by the same job (Sheets API `values.update`). This is the "tables
   updated automatically in Drive" the notes describe, as a read-only mirror the team can open,
   filter and chart, while Postgres stays the source of truth. Names in `clobs_coders` and the
   crosswalk `clobs_videos` go to a separate, more restricted sheet.
4. **Restore drill** (addendum §13): once, download a night's set, load it into a fresh database with
   the documented script, and prove the row counts match. Written up in `docs/09-backup-and-restore.md`.

Steps for María (out-of-editor), when we get there: (a) in Google Cloud console, download a JSON key
for the existing service account; (b) in GitHub → Settings → Secrets → Actions, add
`GOOGLE_SERVICE_ACCOUNT_JSON` (paste the file contents) and `DATABASE_URL`; (c) share the target
Drive folder with the service-account email as Editor (already done for `_platform-backups/`);
(d) run the workflow once by hand from the Actions tab and check the folder. Each step will come
with exact clicks at build time.

Effort: two days including the restore drill.

---

## 5. Phase 5 — already queued, unchanged

- Team screen: deactivating someone with active work shows the affected pairs and links to
  "Move work"; admin action to **void a calibration session** with a reason (needed before a
  both-submitted video can move).
- School 22103's arm; the six gold videos and master scores; remaining Drive links.
- Weekly calendar (docs/07 #1) and the rest of the later-ideas log.

---

## 6. Answers to the questions in the notes

### 6.1 What `clobs_events` contains and why it is worth having

It is the platform's **raw diary**: one row every time a coder does something that matters for
timing or provenance, with the exact second. Nothing in it is typed by anyone; it is written by the
server as a side effect of the coder's actions. Kinds today: `observation_started`, `note_created`,
`note_deleted`, `score_selected` (with the item number), `score_changed` (item number),
`observation_submitted`, `context_card_started`, `context_card_submitted`,
`context_card_confirmed`, `context_card_flagged`, `context_card_flag_resolved`,
`calibration_session_created`, `calibration_joined`, `calibration_opened`, `consensus_saved`
(item number and who moved), `calibration_signed`, `calibration_completed`. Phase 2 adds
`section_started`, `section_heartbeat`, `section_ended` (with the reason) and `video_started`.

What a few rows look like (columns of the export):

| occurred_at | kind | coder_id | display_code | observation_id | payload_json |
|---|---|---|---|---|---|
| 2026-09-15 09:02:11 | observation_started | 3f9c… | V-0417 | 8a1d… | |
| 2026-09-15 09:41:03 | score_selected | 3f9c… | V-0417 | 8a1d… | {"itemNo":1} |
| 2026-09-15 09:44:30 | score_selected | 3f9c… | V-0417 | 8a1d… | {"itemNo":2} |
| 2026-09-15 09:44:58 | score_changed | 3f9c… | V-0417 | 8a1d… | {"itemNo":1} |
| 2026-09-15 10:03:12 | observation_submitted | 3f9c… | V-0417 | 8a1d… | |

Its value: (1) **time on task** without a timer (addendum §8): `minutes_on_item` in the scores file
is computed from these rows, and the section times of Phase 2 are the coarse version of the same
idea; (2) **resume and interruption analysis**: how many sittings a video took, when coders work,
where connections drop; (3) **provenance**: if a score is ever questioned, the log shows when it was
first chosen and whether it changed before locking; (4) **method description for the paper**
("coders spent a median of 38 minutes on scoring…"). If nobody ever analyses it, it costs nothing;
if reliability turns out to vary by time of day or by coder fatigue, it is the only place that
question can be answered.

### 6.2 `clobs_scores_wide`: c1–c8, a1–a8, b1–b8

One row per video. `c1..c8` are the **consensus** scores for items 1–8 (from the signed
calibration), `a1..a8` the **anchor's** individual locked scores, `b1..b8` the **enumerator's**.
The row also carries `anchor_coder_id` and `enumerator_coder_id` so "a" and "b" resolve to people
via `clobs_coders`. Phase 1.6 renames them `consensus_item1`, `anchor_item1`, `enumerator_item1`
and so on, so the file explains itself.

### 6.3 "Mar√≠a Jos√©" and special characters

That string is not a data problem; it is a **reading** problem. The CSV is correct UTF-8; the
program that opened it (Excel or Numbers) guessed an old Mac encoding and drew the two bytes of
"í" as "√≠". Stata 14+ reads the same file correctly, and so does R, Python and any editor.
The standard fix is a UTF-8 byte-order mark at the start of the file (Phase 1.5), which Excel
treats as "this is UTF-8". Restricting names to plain letters would misspell real people's names in
the dataset to work around a spreadsheet's guess, and Ugandan names and Spanish accents alike
deserve to be right. If a fully ASCII column is still wanted for convenience, the export can add
`display_name_ascii` next to `display_name`.

### 6.4 Google Drive as the database

See §4.1 (no) and §4.2 (what to build instead, with steps).

### 6.5 Embedding the 46 videos

See §3b: the file ids are already in the stored links; the embed works where Google's cookies are
allowed (Chrome, Android), is unreliable on Safari (iPhone, iPad), cannot expose the current
timestamp, and should ship as an enhancement over "Watch in Drive", after a one-day test on the
team's own devices.

---

## 7. Proposed calendar

| Week of | Work | Decision point |
|---|---|---|
| 8 Sept | Phase 1 quick fixes (PR); Phase 2 Amendments drafted for review | María confirms §42–46 wording |
| 8–12 Sept | Phase 2 schema + tests (PR); Phase 3b embedding test on real devices | Table of play / no play per device |
| 15–19 Sept | Phase 3 prototype on demo data (PR, deployed to Vercel) | **Team meeting: simple / advanced / both** |
| 22–26 Sept | Finish the chosen interface(s); Phase 4 Drive sync + restore drill | Enumerator training can start on the deployed platform |
| 29 Sept → | Phase 5 items; live coding begins per the wave plan | Deadline 2026-10-30 stands |
