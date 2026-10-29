# STATUS — where the platform stands on 2026-10-28

> Written at the start of the Narratives work (branch `feat/narratives-workspace`), before any code
> changed. It describes the platform as it is, how the project actually ran, and what the new
> Narratives workspace has to support. `docs/PLAN.md` holds the proposal built on this.
>
> No raw video IDs, real narrative text or enumerator PINs appear in this file. Counts and patterns
> only.

## 0. The short version

- The platform is a complete scoring tool: accounts, video queues, context cards, notes, scores,
  calibration, gold set, training, progress dashboards and exports. It was built and deployed
  between 30 August and 8 September 2026 (PRs #1–#28, all merged).
- **It was never used for live work.** It was not IRB/DAT approved in time, so training, video
  tracking, the gold set, scoring and calibration ran in ODK Central at `odk.gse.harvard.edu`,
  and progress checks ran in Google Drive (section 6). Scoring was paused on 13 October, which
  ended calibration. Context cards continued.
- **The ODK "4-digit code" was each person's enumerator ID**, not a secret (section 6.2). That
  matters for the login decision.
- All research data the platform stores sits on **Neon** (managed Postgres), the app runs on
  **Vercel**, and sign-in codes go out through **Resend**. Those are the three third-party services
  that would need to go for a "one host we control" setup (section 3).
- The narrative review is currently done by hand in Word/Google Docs: the AI's narrative is pasted
  into a review template, and reviewers strike wrong text, add corrections in red, and leave
  comments. **None of the 14 reviewed documents uses Word's Track Changes.** It is all manual
  formatting plus ordinary Word comments (section 8).
- The existing autosave does not meet the bar the Narratives work needs. In particular, a draft
  saved on the device is never read back after a crash (section 5).

## 1. Architecture and stack

| Layer | What is used | Where in the repo |
|---|---|---|
| Language | TypeScript everywhere; a few Python helper scripts | `tsconfig.json` |
| Framework | **Next.js 16.3** (App Router, React 19.2). No `middleware.ts`/`proxy.ts`; access checks run in pages, route handlers and the query layers | `app/` |
| Styling | Tailwind CSS v4, shadcn/ui primitives, a custom token set (cream/brown palette, Newsreader/Inter/JetBrains Mono) | `app/globals.css`, `DESIGN_SYSTEM.md` |
| Motion | `motion` (Framer Motion), canvas-confetti, three.js / react-three-fiber (sign-in orb) | `components/motion`, `components/ui` |
| Rich text | **Tiptap 3.30** (MIT), one HTML note per observation, sanitised with `sanitize-html` before anyone else sees it | `components/workspace/notes-editor.tsx`, `lib/sanitize-note.ts` |
| Database | PostgreSQL via **Drizzle ORM** and the plain `pg` driver. 39 tables, 11 migrations (`drizzle/0000`–`0010`) | `db/schema.ts`, `drizzle/` |
| Blinding layer | Two database roles. Admin code uses `DATABASE_URL`. Coder-facing code goes only through `lib/db/coder.ts` / `coder-calibration.ts`, connected as the restricted `clobs_coder` role, which cannot read `video_provenance`, `gold_scores`, `audit_log`, `assignment_log` or `exports`. An ESLint rule enforces the import boundary | `lib/db/*`, `scripts/setup-coder-role.mts`, `eslint.config.mjs` |
| Auth | Auth.js v5: emailed 6-digit code, database sessions of 30 days, no self-signup | `auth.ts`, `lib/auth-policy.ts`, `lib/email.ts` |
| Charts | recharts | dashboards |
| Exports | Hand-written CSV, Stata `.dta` (format 118), codebook, store-only ZIP. Files kept byte-for-byte in Postgres (`export_files.content`, bytea) | `lib/export/*` |
| Tests | Vitest, 137 tests in 20 files, run one file at a time against a real Postgres (`fileParallelism: false`) | `tests/` |
| CI | GitHub Actions: lint, build, migrate into a throwaway `postgres:16`, create the coder role, seed the rubric, run the tests | `.github/workflows/ci.yml` |

**Roles today.** `users.role` is `admin` or `coder`. `is_chief_coder` lets a coder anchor a pair.
`dataset_scope = 'training'` makes an account a trainee. `ui_mode` (auto/simple/full) picks between
the full sidebar interface and the ODK-style simple interface at `/s`. **There is no notion of a
team.** Every coder sees the same scoring navigation.

## 2. What each existing tab does and what data it touches

Navigation is two hard-coded arrays in `components/app-sidebar.tsx` (coder items, then admin items).
URLs come from folders; route groups `(shell)`, `(coder)` and `(simple)` do not appear in URLs.

| URL | Nav label | Who sees it | What it does | Main tables |
|---|---|---|---|---|
| `/signin` | — | public | Email → 6-digit code. "Request permission to enter" form | `users`, `sessions`, `verification_tokens`, `access_requests` |
| `/` | Home | signed in | Greeting, completion bar, worklist; admins also get a study strip | `videos`, `assignments`, `observations`, `scores` |
| `/videos` | My videos | coders | Queue with filters, plus "My dashboard" with personal score statistics | same + `video_locks` |
| `/videos/[id]` | (workspace) | the assigned coder | Start gate (one video at a time), Drive player, problem button, tabs Context card / Notes / Scores with timed sittings | `observations`, `notes`, `scores`, `context_cards`, `context_adults`, `section_sessions`, `video_locks`, `events` |
| `/s`, `/s/videos/[id]/…` | (simple interface) | coders in simple mode | The same work, one question per screen | same |
| `/calibration`, `/calibration/[id]` | Calibration | coders and admins (hidden for trainees) | Pair consensus room behind a co-presence gate, 5-second polling, two-step sign-off | `calibration_sessions`, `_presence`, `_items`, `_signoffs` |
| `/admin/team` | Team | admins | Accounts, roles, chief/trainee flags, interface picker, access requests, preview-as-coder | `users`, `access_requests`, `audit_log` |
| `/admin/assignment` | Assignment | admins | Pair rotation, week plan, seeded arm-balanced waves, "Move work" | `pairs`, `pair_members`, `coder_availability`, `assignments`, `assignment_raters`, `assignment_log` |
| `/admin/videos` | Video library | admins | Drive-link coverage and attachment (the "video tracking" screen) | `videos`, `video_provenance` |
| `/admin/gold` | Gold set | admins | Flag gold videos, enter master scores, certify trainees | `gold_scores`, `certifications` |
| `/admin/training` | Training | admins | Trainee accounts, gold comparison dashboard, admin sandbox and demos | training-dataset rows across the coding tables |
| `/admin/progress` | Progress | admins | Stage counters, per-video stage table, video problems, active locks, reliability statistics | most coding tables |
| `/admin/exports` | Exports | admins | Generate and re-download the nine-table export set | everything, including `video_provenance` |
| `/styleguide` | Style guide | **anyone, no auth check** | Static token preview | none |

For the requested "Scoring" grouping: Training, Video library, Gold set, My videos + the workspace
(scoring), Calibration and Progress are the six items. Assignment and Exports are also
scoring-only. Team is shared by all teams. Because route groups do not change URLs, the grouping
is a navigation change (`components/app-sidebar.tsx`, `components/app-shell.tsx`,
`app/(shell)/layout.tsx`) plus a server-side team check. **No route has to move or be deleted.**

## 3. Hosting and every third-party service

| Service | What it does here | What data passes through it | When |
|---|---|---|---|
| **Neon** (managed Postgres, AWS us-east) | The only database | **Everything the platform stores**: accounts and emails, notes, justifications, context cards, calibration, the video ↔ school ↔ arm crosswalk, gold scores, audit/event logs, and the generated export files themselves | runtime |
| **Vercel** (Hobby plan) | Runs the Next.js app at `i-ed-ltl-clobs.vercel.app` | Every request and response, i.e. all data coders and admins see or submit, in transit and in function memory; build logs; copies of all secrets as env vars | runtime and build |
| **Resend** | Sends the sign-in code email | Recipient email address, the 6-digit code, sender domain | runtime |
| **Google Drive** | Holds the videos; the app links to them or embeds Drive's `/preview` player | The coder's browser talks to Google directly. No video bytes touch our servers. Drive URLs are stored in `videos.drive_url` | runtime, client side |
| Google Fonts (via `next/font`) | Inter, Newsreader, JetBrains Mono | None at runtime: fonts are downloaded at build time and served from our own domain | build only |
| GitHub + GitHub Actions | Code hosting, CI with a throwaway Postgres | Code and synthetic seed data only | — |
| shadcn / 21st.dev / beui / animate-ui registries | Copying UI component source into the repo | Component names; the 21st.dev key | install time only |
| Google service account | Planned nightly backup into Drive (ADR 0001) | — | **not implemented**; no code uses it |

There are **no** analytics, error-tracking, session-replay, CDN or AI calls in the app. The
`neon.ts` file at the repo root is an untracked, unused Neon CLI leftover; nothing imports it.

**Gaps between the docs and the hosting reality:**

- ADR 0001 promised a Dockerfile and `docker compose` "from day one". **Neither exists.** Moving
  off Vercel means writing them now.
- ADR 0001 classified the app's own data as "not Level 3". Addendum §1 says to treat the database
  as Level 3, and your current brief puts IRB/DAT first. Narratives describe minors' speech,
  appearance and behaviour, so I treat narrative text as Level 3–equivalent throughout the plan.
- The nightly Drive backup and the tested restore drill were never built. Today the only copy of
  the database is Neon's own.

## 4. Sign-in today

- Email → Auth.js emails a 6-digit code (15-minute expiry) through Resend → a 30-day database
  session cookie. Unknown or deactivated emails silently get no code.
- No idle timeout. No re-authentication on admin screens, although the addendum asked for it.
- No rate limiting on code requests or code attempts beyond Auth.js defaults.
- Logging out ends the session. A shared device keeps whoever signed in last signed in for 30 days.

## 5. Autosave today (what the Narratives editor must do better)

`lib/use-autosave.ts` writes every change to `localStorage` immediately and saves to the server
800 ms later. I confirmed the following in the code:

1. **Local drafts are never restored.** `readLocalDraft()` exists but nothing calls it. After a
   crash or reload, the editor shows the server copy, and the newer local copy is left unused.
2. **Session expiry looks like "offline".** A 401 shows "Offline – saved on this device". There is
   no sign-in prompt and no retry after signing back in.
3. **Keys are not scoped to the user** (`note-{videoId}`), so two people sharing a browser share
   drafts.
4. **No protection against two tabs.** There is no version check: the last write wins silently.
5. Retries happen only on the browser's `online` event or the next keystroke. There is no backoff
   timer.
6. Notes have no unique index per observation, so a slow first save can insert two note rows.

Items 1–5 are exactly the failure cases you listed for the Narratives work. The Narratives editor
should get its own sync engine (PLAN §3) rather than reuse this hook. Fixing the scoring hook is a
separate, later change; it is listed under risks.

## 6. How the scoring workflow actually ran in ODK

Source: the ODK development folder (`…/Desktop/HGSE/i-ed-ltl-clobs/ODK`), mainly its `README.md`,
the 106 KB `CHANGELOG.md` (8 Sep – 26 Oct), `docs/CENTRAL_MIGRATION.md`, the seven XLSForms in
`forms/`, the generator `build/build_forms.py` and the team workbook. Server: ODK Central v2026.3
at `odk.gse.harvard.edu`; tablets ran ODK Collect 2026.3.

### 6.1 The forms

| Form (form_id, version) | What it is |
|---|---|
| LTL 1. Context Card – TRAINING / REAL CODING (`clobs_training_card` 2026100101, `clobs_coding_card` 2026102601) | Card instrument v2 (Sections A–F: video checks, students, room and camera, adults as a repeat group, notes, timeline pre-filled `00:00-end = A1 is in the classroom`). The real version enforces strict viewing order (`card_no`), a stale-draft guard and an own-row guard |
| LTL 2. Notes – TRAINING / REAL CODING | One multiline note, **or** up to 10 photos of paper notes |
| LTL 3. Scores – TRAINING / REAL CODING (`clobs_coding_scores` 2026100701) | Eight concepts, each with score (required) and justification (≥10 characters). The real version gates the coder to the current session's video, **locks the eight answers** with `once()` stamps plus constraints, then reveals the partner's name |
| LTL 4. Calibration (`clobs_calibration` 2026100701) | Two people at one device: both pick their names and type codes, see each other's scores, justifications and (optionally) notes, enter a final score **and a reason for every concept**, and sign off by re-typing their codes |

- **No gold-set form and no video-tracking form.** The gold set ran through the TRAINING forms.
  Videos were tracked through two Central **entity lists** (`clobs_training_assignments`,
  `clobs_coding_assignments`, 36+ properties: display code, Drive URL, enumerator, partner,
  week, status, stamps, and on the coding list the eight scores and justifications) plus the team
  workbook.
- **Score encoding matches the platform:** `1` = Column A Very Accurate, `2` = A Somewhat, `3` =
  B Somewhat, `4` = B Very. The eight concept titles match the rubric.
- Each form does one entity update and no creates. Rows were created by CSV "append" uploads from
  Python tools (`build/make_weekly_upload.py`). No `pulldata()` and no `search()`; every lookup is
  `instance(...)` on the attached lists. Every form keeps an audit log with
  `track-changes=true`.

### 6.2 How enumerators identified themselves

- "Who are you?" is an autocomplete pick from the attached `clobs_enumerators.csv`, followed by a
  "Your 4-digit code" text field. A **constraint on the device** compares it with that person's
  `access_code` column in the same CSV.
- **The 4-digit code is not a secret.** I confirmed it in the files: in all 32 rows the code equals
  the person's enumerator ID (sequential numbers from 1001). The schema enforces "access_code must
  equal enumerator_id", and the IDs are also printed in the assignment lists and the code handouts.
  The CSV with names, emails and codes was downloaded to every device. Verification was
  client-side only; Central accepts any submission through the App User or a Public Access Link.
- In practice every tablet used **one shared App User**, and all 95 calibrations were submitted
  through a **web Public Access Link**. Logged-in web submissions had failed with 401 on the GSE
  server. A card was filed under another coder's name at least once (26 Oct report).
- Consequence for the platform: the ODK "name + code" habit is familiar, but it provided
  identification, not authentication. The new login should keep the gesture (pick your name, type
  4 digits) while making the digits a real secret. PLAN §5 covers this.

### 6.3 Assignment, gold set, calibration

- **Assignment** was pre-loaded per person: pickers filter the entity list by `enumerator_id = me`.
  Labels showed school and teacher IDs, a team decision of 14 September that replaced the
  platform's opaque codes. Only the treatment arm stayed off devices.
- **Gold set / training:** 7 gold videos. Masters coded them first as the reference; trainee cohorts
  then coded all of them. Training scores were deliberately not written to the entity list, so
  devices never held the reference scores. Comparisons with the masters happened outside ODK.
- **Real scoring** (from 6 October): 250 videos from 35 schools, sampled in Stata with recorded seeds,
  and a fixed pair-by-session schedule (14 coders, 7 pairs per session), redrawn about 10 times with
  released sessions frozen. It was released two sessions a day. The platform's own assignment
  algorithm was **not** used in production.
- **Context-card team** (from 5 October): 5–7 people, one card per video, seeded balanced deal, released
  in batches of 30, redealt on 26 October after two people left. About 273 videos had cards by 26 October.
- **Calibration** stopped when **scoring was paused on 13 October**. Scores skewed to Column B,
  calibration text was being copied, and early results raised questions. Corrections after
  calibration are logged in a spreadsheet, because ODK cannot reopen a submission.
- **Progress checks:** a Google Sheets dashboard on the shared drive, driven by an Apps Script that
  counts submissions per roster row, plus a scores-by-arm sheet shared on 13 October.

### 6.4 Lessons that carry over to the platform

1. **Blinding was weaker in ODK than the platform enforces.** Because ODK allows one entity update
   per form, both coders' scores and notes sat in the list cached on every coding device, hidden
   only by form logic.
2. **Drafts caused duplicate and wrong-video submissions:** 145 of 281 cards were open as drafts at
   the same time as another card by the same coder. One server-side working copy per assignment,
   plus strict ordering, avoids this class of error. The Narratives plan uses both.
3. **Stale data between devices and silent overwrites** (parallel updates blanking each other's
   stamps) are exactly the "two tabs / two devices" problem. Hence the revision check in PLAN §3.4.
4. **Reopening is a real need.** ODK could not reopen a submission, so corrections went into a side
   spreadsheet. The Narratives plan includes an audited admin reopen.
5. **Web versus tablet differences** (JavaRosa vs Enketo) cost days. A single web codebase avoids
   that, but it must be tested on the actual devices enumerators use.

## 7. The AI narrative pipeline's output

- Source: `…/20260913_code/observations/<lesson id>/NARRATIVE.md`, 33 lessons, 52–124 KB each.
  Produced by the HAPI pipeline (Gemini 2.5 Pro via the Harvard HUIT gateway; v17–v21).
- **Despite the `.md` extension it is structured plain text, not Markdown.** It is completely
  regular across all 33 files:

  ```
  === LESSON NARRATIVE — <lesson id> (duration mm:ss) ===
  <4 preamble lines, hard-wrapped>
  Evidence state: …
  (blank)
  GIVEN FACTS SUPPLIED BY THE CONTEXT CARD (…):
    [given] mm:ss - mm:ss — <fact>            ← 394 lines in total, 2-space indent
  Everything else below was derived by the pipeline from the recording.
  (blank)
  --- E01 [m:ss-m:ss] ---                     ← 2,272 episodes in total
  <one paragraph; speech in «guillemets»; evidence codes inline: [W01-V0001, C0017]>
  (covers: W01-S0001, W01-U0001, …)           ← exactly one per episode
  ```

- The lesson id and duration are in the title line, so an upload of `NARRATIVE.md` files can be
  matched to lessons without relying on file names (every file is called `NARRATIVE.md`).
- Two harmless irregularities: one file has a leading space before `===`, and one has a stray
  line containing only `1`. A parser must tolerate both.
- The Word review documents were made from these files by asking an AI to convert them. That step
  was manual and has no script in the folder. The conversion zero-pads episode times
  (`E01 [00:00-00:40]`), shows evidence codes in grey (`8C8C8C`) at 6.5 pt, shows the given facts
  indented at 10 pt, and puts episode headers in bold.
- The current assignment sheet (`20261021_reviewing_narratives/00_assignments.csv`, 39 rows) has
  the columns `order, reviewer, video_id, status, pipeline, video_file, video_drive_id,
  narrative_length, docx, …`. That is the natural import format for the platform.

## 8. Catalogue of editing conventions in the reviewed narratives

**Method.** I copied all 39 `.docx` files from `20261021_reviewing_narratives` (8 reviewer folders
plus `_not_assigned_this_round`) into a scratch folder and parsed `word/document.xml`,
`word/comments.xml`, `word/commentsExtended.xml` and `word/settings.xml` with a script. Every run's
formatting was counted.

### 8.1 Which documents carry edits

- **14 documents have reviewer edits** (from 6 reviewers). All 14 lack the
  `Microsoft Macintosh Word` application tag, which means they were edited and re-saved by
  **Google Docs** (opening a .docx in Drive and editing it in Office-compatibility mode).
- **25 documents are untouched templates** produced in Word (no red, no strikethrough, no
  comments).

### 8.2 The review template (what every document contains before editing)

1. Title `Narrative review: <lesson id>` (bold, 16 pt).
2. Reviewer name, the video file name to watch, and the lesson length.
3. A grey italic instruction to check the file name and length match.
4. **"How to edit the narrative":** keep the original AI text; strike through anything incorrect
   and write the correction next to it in red; add missing information in red; if unsure, leave a
   comment rather than guess; ignore the small grey codes.
5. Three reflection questions with blank answer lines:
   1. **Accuracy and errors** (with examples).
   2. **Missing information and additions**.
   3. **Overall lesson tone and learning environment**, in two parts: (a) the teacher's manner and
      tone, (b) the classroom atmosphere.
6. **"Time spent reviewing and correcting this narrative:"**. One earlier template version has
   **Start:** and **End:** lines instead.
7. A grey bold label `AI NARRATIVE (copy of NARRATIVE.md; original text in black)`, followed by the
   narrative.

Reviewers answered the questions in plain black text under each question. One reviewer used a
list. Several left the questions blank.

### 8.3 Colours

| Colour (hex) | Where it appears | Meaning |
|---|---|---|
| `000000` black | ~2.0 M characters | original AI text (and reflection answers) |
| `8C8C8C` grey (Word writes uppercase, Google lowercase) | ~1.2 M characters, mostly at 6.5 pt | evidence codes `[W01-…]`, `(covers: …)` lines, template instructions (italic) |
| **`FF0000` red** | ~27,400 characters in 1,219 runs, in all 14 edited documents | **reviewer additions and corrections** |
| `434343` dark grey | 5 characters in one document | a Google Docs palette slip, not a convention |

Red is the only colour reviewers used. No other colours or highlighter colours are conventions.

### 8.4 Strikethrough versus deletion

- **Manual strikethrough (`w:strike`), never deletion.** Reviewers struck text instead of deleting
  it, as the template asks. About 75,000 struck characters in total.
- Strikethrough combinations observed:

  | Combination | Characters | What it means |
  |---|---|---|
  | black + strike | ~60,400 | struck original AI text (the main convention) |
  | grey + strike | ~13,300 | evidence codes struck together with the sentence they belong to |
  | **red + strike** | ~1,250 | two uses: one reviewer struck original text *in red* (struck text recoloured red); others struck their own red additions |
  | bold + strike | ~150 | an episode header struck |
  | red highlight + strike | 147 (one run) | a one-off emphasis |

- **No `w:dstrike` (double strike).**
- Typical edit shapes: strike a word or phrase, then type the correction in red immediately after
  it; insert red words mid-sentence; add whole red sentences at the end of an episode paragraph;
  strike whole sentences (often with their grey codes). New paragraphs are rare.

### 8.5 Word tracked changes

**None.** Across all 39 files there are zero `w:ins`, `w:del`, `w:moveFrom`, `w:moveTo`,
`w:rPrChange` or `w:pPrChange` elements, and `trackRevisions` is never switched on in
`settings.xml`. The convention is purely manual formatting. The editor does **not** need a
Track Changes / suggestion engine to reproduce the samples, and the export must **not** emit
tracked changes either: that would change how the documents look and behave in Word.

### 8.6 Comments

- **276 comments** in 13 of the 14 edited documents (1 to 135 per document).
- **Real Word comments**: `word/comments.xml` with `w:author`, `w:date`, `w:id` (no initials),
  plus `word/commentsExtended.xml`. No `people.xml`.
- **Anchoring:** every comment has `commentRangeStart` / `commentRangeEnd` / `commentReference`.
  There are no point comments without a range.
  - Anchored ranges run from 1 character to about 2,900 characters. Most cover a phrase or a sentence.
  - **8 comments span more than one paragraph.**
  - **Comments overlap:** up to 2 comment ranges are open at the same position (in one document).
  - Comments are often anchored on struck text or on a red addition.
- **Replies: none.** No `w15:paraIdParent` in any `commentsExtended.xml`.
- **Resolved/done: none.** `w15:done` is never set.
- **One author per document** (the reviewer). The comment body is a single plain-text paragraph,
  with no formatting inside comments.
- **Content types** (paraphrased): "I didn't see/hear this", corrections of who spoke or the
  speaker's gender, timestamps where something actually happens, notes about voices from a
  neighbouring classroom, questions to the coordinators about the conventions, and context the AI
  missed.

### 8.7 What the new editor must support (derived from 8.3–8.6)

| Need | Evidence |
|---|---|
| Red text (`FF0000`) for additions and corrections | 1,219 red runs |
| Strikethrough on any text: black, grey codes, red, bold headers | §8.4 |
| Strikethrough and red together | ~1,250 characters |
| Typing new text anywhere, including mid-sentence and new sentences | §8.4 |
| Comments on a selected range, including ranges that span paragraphs and overlap other comments, anchored on struck or red text | §8.6 |
| Undo/redo | requested |
| Grey 6.5 pt evidence codes kept intact and strikable | §8.3, §8.4 |
| Structured answers to the three reflection questions (with 3a/3b) and time spent | §8.2 |
| Comment author and date carried into the Word file | §8.6 |
| **Not needed:** tracked changes, comment replies, resolve, other colours, double strike, tables, images | §8.4–8.6 |

The one convention with a gap between the instructions and practice: the template says "keep
the original AI text", but nothing stops a reviewer from deleting it. The 14 samples show no
deletions, but in a browser editor accidental deletion is a real risk. PLAN §1 proposes a review
mode that turns delete on original text into strikethrough.

## 9. Risks and gaps

**Blocking or near-blocking for the Narratives work**

1. **Hosting is not "one host we control."** All data sits on Neon and passes through Vercel and
   Resend. A move needs institutional hosting (HUIT/DAT) that I cannot arrange from here. The
   Narratives code should be written so it runs unchanged on a self-hosted Postgres; PLAN §6 covers
   that.
2. **No Dockerfile**, despite ADR 0001. It has to be written before any self-hosting.
3. **No backup and no tested restore.** For a tool whose top priority is "no work may be lost",
   server-side backups matter as much as browser-side saving.
4. **Untracked files that would break the build.** On disk but not in git:
   - `app/api/coder/videos/[videoId]/context-card/confirm/` and `…/flag/` import functions removed in
     Phase 2.
   - `tests/card-secondpass.test.ts` tests those removed functions.
   - `app/(shell)/admin/preview/page.tsx` hard-codes personal email addresses.
   - `app/(shell)/admin/progress/progress-table.tsx` is not imported anywhere.

   They look like OneDrive resurrecting files deleted in earlier PRs. I have **not touched them**.
   Running `npm run build` or `npm test` locally will fail on them, so they need your decision
   (PLAN open questions).
5. **Local tests and scripts point at production.** `.env.local` holds the live Neon connection
   strings. `tests/setup.ts`, `drizzle.config.ts` and every `scripts/*.mts` load `.env.local`, so a
   plain `npm test` or `npx drizzle-kit migrate` on this machine runs against the **live
   database**. The test fixtures are purgeable `test`-dataset rows, but this is still the wrong
   place to run them. For this work I run everything against a local Postgres (Homebrew
   PostgreSQL 17 is installed; Docker is not) by setting `DATABASE_URL` explicitly. dotenv never
   overrides a variable that is already set. PLAN adds a guard that refuses to run tests against
   a `neon.tech` host.
6. **A stale `.git/index.lock`** from 8 September blocked every git command. I renamed it to
   `.git/index.lock.stale-2026-09-08`; nothing was deleted. The repository lives in OneDrive, which
   is known to corrupt `.git` and `node_modules`; a non-synced folder would be safer.

**Blinding and access**

7. **No team model.** Today, any coder account would see the whole scoring navigation. A
   Narratives-only account needs server-side exclusion from scoring pages *and* scoring APIs, not
   just a hidden menu.
8. **Raw lesson IDs appear in the narratives**: in the title line, and in the review template's
   "video to watch" file name. CLAUDE.md §3 says coder-facing surfaces show only opaque codes. The
   Drive file name shows the ID anyway (an accepted disclosure, Amendment B §12). Whether
   narrative reviewers may see it is your decision.
9. `/styleguide` is public with no auth check. It is harmless (tokens only) but should be
   admin-only or removed from the sidebar.

**Data integrity**

10. The existing autosave defects (section 5) affect notes, cards and scores. They do not affect
   Narratives, which gets its own engine, but they should be fixed if the scoring tabs are ever used
   live.
11. `notes` has no unique index per observation (section 5, item 6).
12. Admin demo/sandbox actions hard-delete the admin's own training rows. This is by design
    (Amendment §38), but it is the one destructive path in the codebase.

**Design**

13. `DESIGN_SYSTEM.md` mandates the cream/brown palette, pill buttons and mono labels. Your brief for
    the new landing page and dashboard bans exactly those. The new areas need their own scoped
    token set, and `DESIGN_SYSTEM.md` needs an amendment so the two do not fight. The existing
    scoring screens keep their look.

**Process**

14. The handoff (`docs/06-handoff.md`) still lists "Next up" items from 8 September. It should be
    updated at the end of this work, with Amendments §49+ recorded in `docs/01-addendum.md` §17.
15. `.env.example` omits `CODER_ROLE_PASSWORD`. Some Tiptap packages are imported but not declared
    in `package.json` (they resolve only as transitive dependencies).
