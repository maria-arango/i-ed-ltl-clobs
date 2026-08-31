# 06 — Session handoff: current state and how to continue

> **To resume in a fresh session, María says:**
> *"Read CLAUDE.md, DESIGN_SYSTEM.md §0, docs/01-addendum.md §17 (Amendments A+B),
> and docs/06-handoff.md. Continue from the 'Next up' section of the handoff.
> Verify the handoff's 'State snapshot' against `git log` before trusting it."*
>
> **Update rule:** whoever finishes a milestone updates this file in the same
> commit. A stale handoff is worse than none.

## Reading order for a new session

1. `CLAUDE.md` — non-negotiables (blinding, score encoding, nothing destructive).
2. `DESIGN_SYSTEM.md` — §0 precedence; tokens are law; light-only; no motion on scoring surfaces.
3. `docs/00-brief.md` + `docs/01-addendum.md` — the spec; **§17 Amendments A + B override earlier text**.
4. `docs/02-plan.md` (day plan), `03-data-model.md` (schema, blinding layers), `04-questions.md` (decision log).
5. `docs/adr/0001-hosting-and-stack.md` — accepted; do not substitute stack or host.

## Working agreements with María (learned, not all written elsewhere)

- She is an economist, not a developer, in the Antigravity editor. Any out-of-editor step needs:
  exact URL → what she sees and clicks by visible name → exactly what to copy and where to paste
  → exact command + success/failure signs. Warn BEFORE anything irreversible or that costs money.
  Never print secrets; they go in `.env.local` (gitignored).
- Raw video IDs / video lists encode school IDs → never in committed files; park under `data/`
  (see `data/admin-recode-set.md`). Decisions made in chat get recorded as numbered items in
  `docs/01-addendum.md` §17.
- Branch per concern; PRs to `main`; she merges via the GitHub button. Conventional commits.
- Stop at reviewable milestones and report in plain language, leading with the outcome.

## State snapshot (last updated 2026-08-31, branch feat/coding-path-blinding)

**Merged to main:** scaffold (Next 16 + Tailwind v4 + shadcn, tokens, /styleguide, re-themed
fluid-orb/dock/dotted-surface/sign-in-flow-1, canvas-confetti), foundation schema
(35 tables in Neon, `dataset` column, score-encoding CHECKs, CI).

**PR #3 (open):** Auth.js email one-time codes (no self-signup, verified end-to-end), María's
admin account, `scripts/create-admin.mts`, video import executed: **538 sessions imported into
live Neon, 510 codable** (28 language-excluded), seed `ltl-clobs-live-2026-08-31`, batch
`main-2026`. Coding unit = teacher session (Amendment B §14).

**PR #4 (open, stacked on #3):** restricted Postgres role `clobs_coder` (no access to
video_provenance/gold_scores/audit_log/assignment_log/exports; column-grant on videos excludes
is_gold), coder query layer `lib/db/coder.ts` (the ONLY db gate for coder-facing code; ESLint
boundary enforces it), API routes `/api/coder/videos(+/:id)`, **blinding test suite** (22 tests
total incl. 10 API-layer blinding tests), CI postgres service, `/videos` queue page.

**Environment that already exists (do not recreate):** Vercel + Neon accounts; domain
`ltl-classroom-observations.org` verified on Resend; Google service account
`clobs-backup@ltl-clobs-backup.iam.gserviceaccount.com` with editor on `_platform-backups/`;
21st.dev key. All keys in `.env.local` (incl. `DATABASE_URL_CODER` written by
`scripts/setup-coder-role.mts`). María's Drive mount has the mapping file at
`data/raw/00_selected_teachers_rand.dta`; combined-video format lives in the training folder
(see Amendment B §14). `neon.ts` and `21st_dev_components.md` at repo root are untracked
leftovers María may delete.

**Gotchas:** npm ≥ 11.17 rejects `--allow-scripts` → shadcn runs via `npm run ui -- add …`
(shim in `scripts/shadcn-npm-shim/`). OneDrive can corrupt `node_modules` → `npm ci` fixes.
`next dev` re-appends an agent block to CLAUDE.md (committed on purpose). `.mts` scripts run on
Node's native TS (Node ≥ 24; CI uses 24). Local Node 26.

## Open decisions waiting on María

- School **22103** (2 sessions) has no arm → resolve before those enter assignment waves.
- Gold-set videos + certification threshold (after her team meeting; likely from the recode set
  in `data/admin-recode-set.md`).
- Training videos (~4) for the trainee space; chief-coder roster (Hamlet/Simon/Shaily probable).
- Kimanya imagery for the landing page.

## Stage 2 — DONE on PR #4's branch (2026-08-31)

Rubric seeded from the .tex (version 2026-08-22, extractor + seeder in scripts/), field help
seeded; score-lock triggers (0002+0003 — locked scores never UPDATE; DELETE allowed only for
sandbox datasets so the test purge works); coder write layer + routes (notes/scores/submit/
context-card); dataset stamps from the ASSIGNMENT, not the account; the full workspace UI at
`/videos/[videoId]` (Drive link card, tabs, free-form notes with optional mm:ss, scoring with
rubric pane + chips + anchor callout + two-step locking submit + confetti moment, context card
with adults + inline help, useAutosave with localStorage mirror + offline retry). 29 tests.
Live HTTP smoke test passed end-to-end. `scripts/seed-demo.mts` gave María a training-dataset
demo queue (V-DEMO-01/02) so she can try the whole flow.

## Progress since (2026-08-31, cont.)

Deployed to Vercel (https://i-ed-ltl-clobs.vercel.app) — María signed in on production.
Editor review rounds done: Tiptap toolbar (icons, multicolor markers incl. purple, no tables,
no dashed list), heading styles INLINE in stored HTML (environment-proof; verified on a prod
build with save→reload roundtrip via Playwright — kept as devDep for hands-on UI verification).
pg SSL warning silenced via lib/pg-url.ts hardenSslMode. Home page = progress dashboard +
admin study-overview strip (PR #6). Stage 3 begun: lib/assignment/algorithm.ts — pure seeded
wave assignment (arm blocking ±1, history-aware school spread, Amendment A card-duty balance),
12 tests (PR #7). 41 tests total.

## Progress (2026-08-31, cont. 2)

Team screen (/admin/team: add sign-in emails, roles, chief/trainee flags, deactivate —
browser-tested). Home de-slopped per impeccable craft floor (completion bar object, worklist,
hairline stat strip; ::selection/caret themed) and content column centered. Assignment screen
(/admin/assignment): pair formation with Amendment B §2 rules enforced, seeded wave
preview→confirm with inputs-hash guard, per-pair balance evidence shown, assignment_log carries
seed+algorithm version. 47 tests. PRs #8 (CI fix), #10 (centering), #11 (assignment) —
#11 includes #10.

## Progress (2026-08-31, cont. 3)

Amendment B §18-21 implemented on PR #11's branch: availability model (videos/day + dates,
Team screen editor; wave capacity = min(pair) × working days), seeded pair rotation
(prefers new pairings, soft-dissolves old), promote/demote admin, guarded permanent delete,
left icon sidebar shell + 280ms page transitions, em-dash copy sweep, sign-in ready for
public/kimanya/ photos (folder README committed; María drops files in Finder).

## Next up

1. **Stage 3 continues:** the calibration room (co-presence gate — the ONLY place partner data
   is released; sanitize partner note HTML before display), gold set + certification gate,
   Drive-link attachment step (match combined files by sid_tr_id prefix), reassignment tooling
   (dissolve pairs with active work), per-pair capacity from coder_availability (waves currently
   take one videos-per-pair number).
2. **Stage 2 leftovers:** the confirm/flag read-only second pass on the card after the partner
   submits (Amendment A), events for focus-lost/idle, elapsed-session indicator, small-screen
   fallback for the side-by-side layout, encouragement messages at section completion (docs/05).
2. **Deploy to Vercel** (import repo, set env vars incl. DATABASE_URL/CODER, AUTH_SECRET,
   RESEND_API_KEY, EMAIL_FROM) so the team can touch it.
3. **Stage 3:** assignment algorithm (seeded, arm-blocked waves, anchor+enumerator pairs —
   Amendment B §2; capacity note in 04-questions O1), calibration room (co-presence gate,
   consensus mandatory, sign-off, immutable, partner data released ONLY here), gold set +
   certification gate, admin Team/Assignment screens, Drive-link attachment step (match
   combined files by sid_tr_id prefix; 3 duplicate-session placeholders need manual matching).

**Then Stage 3:** assignment algorithm (seeded, arm-blocked waves, anchor+enumerator pairs —
Amendment B §2, capacity note in 04-questions O1), calibration room (co-presence gate,
consensus mandatory, sign-off, immutable), gold/certification gate.
**Stage 4:** admin dashboards, reliability stats, exports (see §12 + Amendment B), nightly
Drive backup + tested restore. **Stage 5:** polish, embedded playback, encouragement
(docs/05), Kimanya image. Deploy to Vercel + purge/`.env` setup still pending.
