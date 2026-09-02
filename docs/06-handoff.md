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

## Progress (2026-08-31, cont. 4)

PRs #10/#11 merged. Kimanya photos committed (optimized, `public/kimanya/`,
first-alphabetical shows on sign-in) + `docs/07-later-ideas.md` (parked
nice-to-haves: weekly calendar, chat, online avatars, cursor effect) on PR #13.
**Calibration room built (branch feat/calibration-room):** migration 0005
(presence heartbeat `last_seen_at`, one non-voided session per video+pair,
DB triggers freezing completed calibration items/sessions — voiding with a
reason stays possible), `lib/db/coder-calibration.ts` (the ONLY partner-data
release point; gate: session flips 'open' on first true co-presence and the
release is then permanent per CLAUDE.md §2 wording), routes under
`/api/coder/calibration`, queue page `/calibration` + room
`/calibration/[videoId]` (5s join/heartbeat polling, consensus chips with
score tokens, rationale required when anyone moved — resolution computed
server-side, two-step sign-off, second signature completes session +
assignment + video), partner note HTML sanitized via `lib/sanitize-note.ts`
(sanitize-html, allowlist mirroring the Tiptap editor). Coder role grants
updated (calibration_items UPDATE; videos/assignments UPDATE(status) for
completion) — `setup-coder-role.mts` now PRESERVES the existing password so
re-running never breaks Vercel. 16 new tests (63 total): co-presence gate,
lobby leak checks with sentinels, sanitization, resolution matrix, sign-off,
DB-level immutability. Browser-verified end to end with two Playwright
contexts on a prod build. `seed-demo.mts` extended: V-DEMO-02 now carries a
partner-submitted observation + a lobby session whose placeholder presence
is pinned to 2100, so María can experience the whole room alone (her
signature completes it); already seeded for her account.

## Progress (2026-08-31, cont. 5 — María's calibration review)

On PR #14's branch: wave-number race fixed (wave numbers count only
assignedBy-stamped assignments; waveNo + week in the preview hash), wave-test
audit cleanup scoped to its own seeds, calibration polish (presence initial-
bubbles in the room header, rationale/save-button aligned, copy at full
measure). On feat/week-plan-and-shell (stacked): **Amendments 22–25**
(training set 6 = 2/2/2; gold set 6 = 2/2/2, list in `data/gold-set.md`,
3 chosen; third-value consensus PROVISIONAL pending her admin meeting;
week-based availability planning). **Assignment screen is now the weekly
flow**: 1) pick week dates, 2) roster with working-checkbox + videos/day
(writes week-scoped coder_availability entries, append-only), 3) seeded
wave preview→confirm using that week's availability (previewWave/confirmWave
take weekStartIso). Team screen: availability column removed, Actions column
with pill buttons. **Shell restructure**: app/(shell) route group holds
Home/My videos/Calibration/admin pages; sidebar+topbar live in its
layout.tsx and template.tsx animates ONLY the content pane (this is what
makes the 280ms transition actually visible between sidebar items); the
ESLint blinding boundary now also covers app/(shell)/videos and
app/(shell)/calibration; workspace stays standalone under app/(coder).
Shared table primitives (components/ui/table.tsx) + PillButton restyle all
tables (videos, calibration, team, pairs, wave preview); My videos shows
the partner per video.

## Progress (2026-08-31, cont. 6 — merge fix, depth pass, gold/cert/Drive)

**Merge mishap found:** PR #15 merged into feat/calibration-room but PR #16
carried only older commits to main → the deployed site never got round 3.
Branch feat/design-depth-and-gold re-bases everything on main; ONE merge
delivers it all. **Depth pass (Amendment §27 + DESIGN_SYSTEM §3 elevation
amendment):** shadow tokens --clobs-shadow-card/-hover, .elev-card on all
cards/tables, .card-lift hover (reduced-motion safe), route transition is
now the documented side-by-side SLIDE (28px, content pane only), ALL
paragraph width caps removed outside the workspace rubric pane, manual
"Form a pair" card removed (Amendment §26 — rotation is THE pairing
mechanism; dissolve + data-layer createPair remain). **Gold set +
certification (/admin/gold):** search-and-flag videos gold (un-gold refused
once master scores exist), 8-item master-score entry with rationales under
the active rubric (upsert, audited), trainee agreement (exact/adjacent per
ordinal §9) computed against gold, certify=promote-to-live / record-fail
with attempt history (decideCertification). **Video library
(/admin/videos):** link coverage stats, bulk Drive-link attach by
sid_tr_id-prefix matching with preview→confirm (exact rawFilename match
first so ~2 duplicates resolve; ambiguous files get a per-file picker),
single attach by display code, Google-Drive-only URL validation.
purgeFixture handles gold/cert rows. 72 tests (9 new). Sidebar: Video
library + Gold set. Screens browser-verified.

## Progress (2026-08-31, cont. 7 — alive pass, card second pass, Progress)

María installed registry components (kept: GlideMenu, animate-ui checkbox,
motion file-tree/dock as reference, skeleton/button/input; removed:
animate-ui sidebar — registry install incomplete; beautifului table demos
moved to .reference/beautifului/). **Alive pass** (adoption map at the end
of docs/07): gliding sidebar (hover glide + layoutId active pill) with
notification badges (new videos / calibrations ready, computed in the
(shell) layout), filterable My videos table (chips + search), animated
checkboxes in the week plan, shimmering route skeletons
(app/(shell)/loading.tsx), calibration-completed MOMENT (stroke-drawn
check + one confetti burst, only when completion happens live), video-link
card lift + arrow slide, NumberTicker count-ups (home, video library,
Progress), TiltCard on the sign-in photo. **Card second pass (Amendment A)
shipped**: confirm/flag in lib/db/coder.ts (getReviewableCard guards:
reviewer's own scores first, author never reviews, flag needs a reason),
routes context-card/confirm + /flag, ReviewPanel in the card form, flagged
cards reopen for the author and resubmission resolves the flag + resets
confirmation; 6 new tests. **Stage 4 begun**: /admin/progress — insight
cards + per-video stage table (pool → assigned → one submitted → ready →
calibrated), lib/db/admin-progress.ts. Sidebar: Progress item added.

## Progress (2026-09-01 — training space, sandbox, taste audit)

**Data ops (live Neon):** 28 language-subject sessions RE-INCLUDED (Amendment
§28, scripts/include-language-videos.mts, audited; codable = 538). Arya's
demo seeded (seed-demo.mts now makes per-account codes: V-DEMO-ARYAS-01/02,
calibration demo included). **Training space (Amendment §29,
/admin/training):** add-trainee (auto-assigns the training pack = the gold
set as single-rater training-dataset assignments via
lib/db/admin-training.ts), progress table, per-trainee response viewer
(/admin/training/[userId], scores+justifications+notes beside gold), sliding
Accounts/Dashboard switch, gold-comparison dashboard (per-video matrices +
exact/adjacent/quadratic-weighted/mean-signed/A-B-flips; provisional 90%
exact bar), admin SANDBOX button (assign the pack to yourself). Trainees
never see the Calibration nav item. **Score review (Amendment §31):**
"See all my scores as a table" + review-before-lock step with a check
prompt in the scoring panel. **§30 recorded:** consensus rationale is one
shared text (already built that way). **Taste audit** (impeccable +
emil-design-eng + design-taste-frontend): badge pop no longer scales from
0, hover lift gated to fine pointers, skeletons shimmer (reduced-motion →
pulse), scrollbars themed to the palette; rejected (brief wins): removing
kickers/eyebrows, serif/palette bans, any motion reduction. purgeFixture
now clears pair-scoped assignments (training packs). 81 tests.

## Progress (2026-09-01, round 6 — polish, dashboards, access requests)

Amendments §32–36. **Integrity:** justifications required on submit (scores
AND gold rationales; tests updated), empty context cards refused (subject,
composition, count, ≥1 adult). **Moments alive everywhere:** shared
MomentCard (rise-in + drawn check) for card/score submissions, gold-save
gets a darkened-overlay confirmation modal, submit scrolls back to the top
so the moment is seen. **Gliding everywhere:** GlideMenu generalized to
horizontal (left/width), applied to the Tiptap toolbar, workspace tabs,
scoring rail (with a layoutId active pill), progress filter chips.
**Score table (§34):** the review view is now the EDITABLE table (chips +
justification per row, saving directly); after item 8 the Next slot turns
into "Review and submit". **Workspace ambience:** floating Kimanya tiles
(float-drift keyframes) beside card + notes on xl screens. **Progress
dashboard:** weekly expected-vs-actual outlook (getWeeklyOutlook from
coder_availability; Mondays Sept→Oct 30), pipeline stacked bar (sequential
lake ramp — dataviz-validated), arm donut (validated trio #2F6BAA/#B4642B/
#7B4B94), filters school/arm/teacher + clearer stage labels. **Training
dashboard:** sample preview (10 synthetic enumerators, bannered, client-
only) + charts view (exact% vs 90% bar, lean) — recharts installed.
**Access requests (§35):** access_requests table (migration 0006, applied),
public POST /api/access-request (honeypot, no enumeration), sign-in
"Request permission to enter" modal, Team screen approval section
(training/live/decline). **María-only:** /admin/preview ("What Arya can
see", email-gated) + home button. Home copy now points at Progress.
purgeFixture unchanged. NOTE: rerun `node scripts/setup-coder-role.mts`
after pulling? Not needed — access_requests is admin-only and the coder
role gets no grant (revoke-all covers it on next run).

## Progress (2026-09-01, round 8 — pair peek)

Round-8 additions after María's check: My-dashboard per-concept chart
fixed (taller, truncated labels, full name in tooltip); "Remove my training
pack" button beside the sandbox (deletes own pack assignments + everything
coded on them, INCLUDING the training context cards — a gold video's unique
card slot must be free before live coding; note for a future session: a
trainee's training card on a live gold video occupies that slot until their
pack is removed — consider card-per-dataset if it bites); flagging a video
gold now AUTO-ASSIGNS it to every active trainee (assignGoldToAllTrainees;
the pack always equals the gold set, Amendment §29).

"See their hand": the Assignment pairs table is now a client component
(pairs-table.tsx) where each row expands an alive card below it —
getPairAssignmentDetails (arms mix with the validated dot colors, schools,
card-duty split, every video code chip with its arm dot and a "card"
marker for anchor-filled cards). Loads on first open via pairDetailsAction,
skeleton while fetching, moment-enter on reveal. 88 tests.

## Progress (2026-09-01, round 7 — final touches before the new session)

Amendments §37–38. **Completion is honest** (§37): submitObservation refuses
without real note content and (for the card-filler) the submitted card —
the "Complete" pill now means card+notes+scores; tests updated across four
suites. **Personal dashboards** (§38): getMyCodingStats in the restricted
coder layer; My videos gained a sliding "My videos / My dashboard" switch
(components/ui/view-switch.tsx, reusable) with score distribution, per-
concept lean vs the A/B divide (recharts), stat tiles. **Demo self-service**
(§38): createDemoVideos/resetMyDemo in lib/db/admin-training.ts (per-account
codes, calibration partner pre-seated; reset hard-deletes videos+scores+
notes+cards+calibration+pair — training rows are deletable by design);
buttons on the Training sandbox card. **Removed** the road-to-Oct-30 chart
(getWeeklyOutlook kept in lib for the future weekly calendar). Floating
tiles now scattered (offsets/widths/tilts). Request-access copy trimmed.
Sign-in request button, Team approvals, access requests all confirmed
working by María. 88 tests.

## Next up

1. **Stage 4 continues: EXPORTS** — the tidy AI-training datasets
   (scores long/wide, single-table context cards with A1–A6 blocks,
   calibration records, notes) + the codebook, per addendum §12 and
   Amendment B §1/§5/§6; column names/types/row counts contract-tested.
   `.reference/beautifului/RecordsTable` kept as the records-screen pattern.
2. **Reliability statistics** on Progress (exact/adjacent agreement,
   quadratic-weighted kappa or Krippendorff's alpha per item, per-coder
   signed deviation — addendum §9), once real double-coded data exists.
3. **Reassignment tooling**: move work when someone leaves mid-video —
   pool untouched videos, transfer in-progress work with provenance,
   preserve completed work, consequences PREVIEWED before confirming
   (addendum §6, CLAUDE.md §7).
4. **Waiting on María:** school 22103's arm; flag the 6 gold videos + enter
   master scores once the rubric is final (data/gold-set.md holds 3 + links);
   the remaining 3 gold choices; Drive links via Video library.
5. Stage 5 later: embedded theatre playback, nightly Drive backup +
   restore drill, weekly calendar (docs/07 #1), remaining later-ideas.



1. **Stage 3 continues:** gold set + certification gate (María's gold videos pending),
   Drive-link attachment step (match combined files by sid_tr_id prefix; 3 duplicate-session
   placeholders need manual matching), reassignment tooling (dissolve pairs with active work,
   preserving completed work per CLAUDE.md §7). Open question flagged to María on the
   calibration PR: the final consensus may currently be any of the four values (recorded as
   both_moved + rationale when it matches neither individual score) — confirm or restrict.
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
