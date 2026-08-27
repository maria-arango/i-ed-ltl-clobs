# ADDENDUM — constraints, decisions already made, and what to resolve before building

Everything above stands. This addendum adds context you cannot infer from the description, corrects two
things the description gets slightly wrong about our existing materials, and flags decisions that must be
settled before any code is written.

## 0. How I want you to proceed

Do not write application code yet. First produce, for my approval:

1. A short **written plan**: architecture, stack, hosting, and a phased build order.
2. A **data model** (entities, relationships, and the exact export tables — see §12).
3. A list of **architecture decision records** (ADRs) for the choices that are expensive to reverse
   (auth, hosting, database, video delivery, realtime layer). One short file each, in `docs/adr/`.
4. Your **open questions**, grouped by whether they block the plan, block the build, or can wait.

Assume I am not a software engineer. Optimise every choice for something a research team can still
operate and hand over in two years, not for novelty. Where you choose a default, say so and say why.

## 1. Data governance — this is blocking, resolve it first

- The videos are Harvard **Level 3** data (identifiable minors). The videos themselves stay in Google
  Drive and are only linked or embedded — that part of the design is settled.
- **But the platform's own database is also sensitive.** Coder justifications quote what specific pupils
  said and did; the context cards describe pupils' uniforms, hair, and appearance and list the adults in
  the room. Treat the app database as Level 3 as well, not as anonymous scores.
- Consequence: the hosting decision is a compliance decision, not a convenience one. Before proposing
  Vercel/Supabase/Render/Fly or anything similar, tell me plainly what data would sit where, in which
  region, encrypted how, and who at that vendor could technically read it. I will need to clear it with
  HUIT/IRB, so give me a one-page summary written for a compliance reviewer, not for a developer.
- **No Level 3 data goes into the GitHub repository, ever** — not the context cards, not the pilot scoring
  sheets, not the video list with school identifiers, not `.env` files. The repo holds code, schemas,
  documentation, and synthetic seed data only. Set up `.gitignore` and a pre-commit check accordingly.
- No third-party analytics, session-replay, error-reporting-with-payloads, or AI/LLM API calls on any page
  that displays notes, justifications, or context cards, unless I approve that vendor explicitly.
- Assume coder accounts include staff at Kimanya (Uganda) as well as HGSE. Flag anything about the design
  that would require a data-sharing agreement between the two.

## 2. Authentication and blinding

- Ignore my "maybe just a username, no password" idea — it does not survive the blinding requirement.
  If a username alone is enough to log in, any coder can log in as their partner and read that partner's
  scores before calibration, which is exactly the bias we are trying to prevent.
- Default I want you to assume unless you argue otherwise: **passwordless magic link / one-time code sent
  to a work email**, long-lived sessions on trusted devices, no password to remember. Add an idle timeout
  and re-authentication for admin-only screens (exports, assignment, user management).
- Blinding must be enforced **server-side**, not by hiding UI: a coder's API requests must not be able to
  return another coder's scores or justifications for a video until that pair's calibration session for
  that video has been opened by both parties. Please treat this as a security requirement with a test.
- **Our video IDs leak the blinding.** They look like `10102_9`, `22209_37` — the first block is the
  school code, so a coder can tell which videos come from the same school and can spot clusters. Coders
  must never see the raw ID. Generate an opaque per-video display code (e.g. `V-0417`), show only that
  everywhere in the coder interface, including in Drive link labels and file names where possible, and
  keep the mapping admin-only. School, arm, and teacher-level assignment must not exist anywhere in the
  data the coder-facing API can return.

## 3. What our pilot files actually show — the data model must handle this

I have attached four real examples. Read them before designing the schema; two of them contradict the
simplified description I gave above.

**Context cards (`context_cards_v3.xlsx`)** are *not* one row per teacher. They are one row per
**video × scene**, where a video can have several scenes if the setting changes mid-recording. Each row
carries: `video, scene, from, to` (MM:SS), `subject, composition, approx_count, uniforms,
appearance_caveats, room, camera, notes`, then a repeating block for up to **six adults**
(`A1..A6` × `role, sex, clothing, clothing_caveats, features, behavior, speaks`), then a free-text
`timeline`. The form must therefore let a coder add and remove scenes, and add and remove adults within a
scene, rather than presenting a fixed grid. The sheet's second row holds the field-level instructions —
those should become inline help text in the form, not be lost.

**Scoring sheets (`LTL_CLOBS_20_scores_stata.xlsx`)** — one tab per video, one row per item, eight items,
and columns in pairs of `NAME Score` / `NAME Notes / Justification`. Note that in the pilot **three or
four** people coded most videos, not two, and the tabs are not consistent about which people. The
production design is pairs, but build the model as *n raters per video* with a pair as the normal case,
so that adding a third rater or an adjudicator does not require a migration.

There are also **two** consensus columns in the pilot — `Final Score - Revised` and
`Final Score - Averaged`. Decide with me which one the platform produces (my current thinking: the
platform records the *revised/agreed* score, and any average is computed at analysis time, not stored).

Missing values in the pilot are the string `" ---"`. In the platform, an item left blank and an item that
**cannot** be coded are different things and must be stored differently. The rubric already says that
missing or ambiguous evidence scores Column A, so there is no "don't know" option — but there must be a
video-level **unusable** flag (no audio, corrupted file, camera on the wall for 40 minutes, wrong lesson)
with a reason, which takes the video out of the denominator and back to the admin queue.

## 4. The instrument: canonical codebook and versioning

- Eight concepts, fixed order, exactly as in the attached manual: (1) cooperative and collective learning,
  (2) teacher creates opportunities for intellectual agency, (3) pupils independently exercise intellectual
  agency, (4) critical thinking and deeper learning, (5) scaffolding, (6) checks for understanding,
  (7) specific feedback, (8) connects learning to everyday life.
- Four ordered options, always in this order and encoding:
  `1 = A Very Accurate`, `2 = A Somewhat Accurate`, `3 = B Somewhat Accurate`, `4 = B Very Accurate`.
  Store the numeric value, the column (`A`/`B`), and the degree (`somewhat`/`very`) as separate fields —
  we analyse the column split on its own.
- The rubric content (importance, indicators, special note, four anchors, examples per option) should live
  in the database or in structured files (JSON/YAML) generated from the LaTeX source, **not** be
  hard-coded in components. It will change. Every scored item must store the **rubric version** it was
  scored against, and exports must carry that version, or scores from before and after an edit will be
  silently pooled.
- The manual also defines a **shared four-band reach scale** ("almost no one / a few of the same pupils /
  a good share of the class / most of the class") used across items. Surface it as always-available
  reference in the scoring UI, and give coders a simple **pupil tally counter** while they take notes —
  the manual instructs them to count distinct pupils rather than form an impression, and right now they
  have no tool for that.
- The manual's front matter also carries guiding rules for coding (start at Column A; every Column B score
  needs one concrete moment with a time; read the Special Note first; score each concept independently).
  These should be present in the interface at the moment of scoring, not only in training.

## 5. Notes must be timestamped and citable — this is the highest-value change

Right now notes are prose in a Google Doc, and that is the main reason the pilot data is hard to feed to
the AI. Instead:

- The notes screen should capture notes as **timestamped entries** (a video timestamp field plus the text),
  entered as the coder watches, not as one free block. Keep a free-text field too, but make the
  timestamped entry the default path, with a keyboard shortcut to start a new entry.
- When a coder enters a justification for an item, they should be able to **attach one or more of their
  own note entries** to it. The rubric requires a concrete moment with a time for any Column B score, so
  the interface should ask for one, and the export should carry the cited timestamps as a field.
- Notes must be visible **side by side** with the scoring screen (I mention this above; this is where it
  matters most) and must be editable from that view without losing scoring state.

This gives us, per item, a score, a justification, and the exact evidence in the video the coder used —
which is the training signal we actually want and never got from the spreadsheets.

## 6. Assignment and randomization — one methodological correction

- I asked for treated teachers in treated schools to be watched first. **Do not implement it that way.**
  Coders drift over time — they get faster, stricter, and more calibrated — so if treated videos are
  coded first, the coding period becomes confounded with treatment arm and the whole comparison is
  compromised. Instead: **block on arm within each assignment wave**, so every coder and every week
  contains a similar mix of control, dispersed, and connected. If we need some subset early for a
  deliverable, define it as an explicit, separately-flagged priority batch that we will control for, and
  make the flag visible in the export.
- Constraints the algorithm must respect: every video coded by exactly two coders (confirm — see §16);
  the two coders of a video must be a currently active pair; balance across arm, school, subject, and
  teacher-level assignment *within* each coder and each pair; no coder gets a run of same-school videos;
  spread each school's videos across coders so school effects are not coder effects.
- The algorithm must be **seeded and reproducible**, and every assignment (and reassignment) must be
  logged with its reason, so we can describe the process in the paper.
- Reassignment: when a coder leaves, changes FTE, or a pair is dissolved, unstarted videos return to the
  pool, in-progress work is preserved and either finished or explicitly voided with a reason, and
  completed individual codings never disappear. Show the admin the consequences before confirming.
- Capacity: model coder availability as an FTE fraction with start and end dates (people move between
  100 / 75 / 50%), and derive targets from that rather than assuming 15 videos a week for everyone.

## 7. Calibration protocol — decisions I need you to force

The description says "both log in, compare, agree, sign". Beyond that, please propose defaults and get my
sign-off on:

- What happens when they **cannot agree** on an item — third-party adjudication, escalation to the
  admin queue, or a recorded disagreement? (There must be some path; it will happen.)
- Must the final score be one of the two submitted scores, or may the pair land on a third option?
- Are individual scores **locked** at submission? (They must be — otherwise the calibrated score is not
  independent evidence and the reliability statistics are meaningless.)
- Do we capture *why* the score moved? A short consensus rationale per item where the two differed is
  extremely valuable for training the AI and costs the pair thirty seconds.
- Is an asynchronous fallback allowed when the pair cannot meet live, or is co-presence mandatory?
- Both parties "sign": record who, when, from where, and make the calibration record immutable afterwards.

## 8. The timer — replace it with passive instrumentation

You are right to be suspicious of my timer idea, and so am I. A visible countdown will make coders anxious,
can be gamed by drafting elsewhere, and cannot be enforced once the video is watchable in Drive. Instead:

- Log **events**, not a timer: item opened, first keystroke, score selected, score changed, item completed,
  screen focus lost/regained, idle over N minutes, submit. Derive time-on-task afterwards.
- Show the coder a discreet, non-judgemental elapsed indicator for the current session, and let them see
  their own median completion time on their dashboard. Do not show a deadline countdown per video.
- Tell coders, in the interface, that timing is used to plan workload and not to evaluate them. State it
  in the training materials too. Anything else corrupts the behaviour we are measuring.
- Support **resume**: a scoring session that is interrupted must restore exactly, with a visible note that
  it was completed across N sessions, and that fact should reach the export.

## 9. Gold-standard set, certification, and drift

Not in my description, but the manual requires it: the reach bands "must be calibrated against
master-coded lessons before live coding begins". So the platform needs:

- A **gold set** of videos with master scores entered by the research team, invisible as such to coders.
- A **certification gate**: a new coder codes the gold set and cannot be assigned live videos until their
  agreement with the master scores clears a threshold we set.
- **Seeded re-checks**: periodically slip an already-gold-scored video into a coder's queue and track
  agreement over time, so drift is visible on the admin dashboard before it contaminates a month of data.
- Reliability statistics on the admin dashboard should be the right ones for an ordinal four-point scale:
  exact agreement, adjacent agreement, quadratic-weighted kappa or Krippendorff's alpha per item, and
  per-coder mean signed deviation from the consensus (who runs high, who runs low). Plain percentage
  agreement alone will mislead us.

## 10. Video delivery — verify before promising

Before committing to embedded playback, verify and report back on:

- Whether the videos sit in a **Shared Drive** and who administers it; whether every coder's Google
  account can be granted access; whether Kimanya staff accounts are in the same Workspace or external.
- Whether Google Drive's `/preview` iframe embed still works reliably in current browsers given
  third-party cookie restrictions, for a viewer signed into the required account, at our file sizes.
- Whether we can obtain file IDs programmatically (Drive API, service account) to build links, or whether
  I need to supply a mapping sheet. Assume I can supply a mapping sheet as the fallback.
- What happens on failure. The design must degrade to "open in Drive in a new tab" without breaking the
  workflow, and the embedded theatre mode is an enhancement on top, not a dependency.
- Playback quality of life if embedding works: speed control, 10-second skip, and a "copy current
  timestamp into a note" action, which is the single feature that would most improve note-taking.

## 11. Coders' actual working conditions

- Assume variable bandwidth and intermittent connectivity in Uganda. Every text field must autosave
  locally and sync when the connection returns; a dropped connection must never lose two hours of notes.
  Show connection and save state honestly.
- Tell me what device profile you are designing for and confirm it with me before building: laptop screen
  sizes, browsers, whether coders share machines (which affects session handling and the side-by-side
  layouts).
- The side-by-side video + notes + scoring layout is demanding on a small screen. Design the fallback
  explicitly rather than letting it break.

## 12. Export contract — specify it now, build backwards from it

"Tidy dataset that can be fed to the AI" needs to be a written contract, agreed before the schema is
built. My starting proposal, for you to refine:

- `clobs_scores_long` — one row per **video × item × rater**, where rater is an individual coder or the
  pair consensus. Columns: `video_id, display_code, school_id, arm, teacher_assignment, item_no,
  item_name, rater_type (individual|consensus), coder_id, score_num (1–4), score_column (A|B),
  score_degree (somewhat|very), justification, cited_timestamps, submitted_at, n_sessions,
  minutes_on_item, rubric_version, gold_flag, priority_batch_flag`.
- `clobs_scores_wide` — one row per video, one column per item for the consensus score, for quick analysis.
- `clobs_context_cards` — one row per **video × scene**; `clobs_context_adults` — one row per
  **video × scene × adult**. Do not flatten six adults into one row in the export.
- `clobs_notes` — one row per timestamped note entry, with coder and video.
- `clobs_events` — the raw event log, for the timing analysis.
- `clobs_assignments` — assignment and reassignment history with seeds and reasons.
- `clobs_calibration` — one row per video × item recording both individual scores, the final score, who
  moved, and the consensus rationale.

Formats: CSV and Stata `.dta` with variable labels and value labels applied (we work in Stata), plus a
machine-readable codebook. Every export carries a timestamp, a row count, and the rubric version, and
admins can re-download any past export unchanged. Identifiers in exports are stable across exports.

## 13. Administration, audit, lifecycle

- Roles: **admin** (my team: everything, including exports and unblinded fields), **coder**, and a
  read-only **PI/observer** role that can see progress and reliability but not download identifiable data.
- Full audit log of admin actions: assignment changes, role changes, exports downloaded, unblinding.
- Automated backups with a **tested restore procedure**, documented in the repo. Say how often, where the
  backups live, and how to restore — and prove it once before we go live.
- Define what happens at project end: how the data is archived, what is deleted, and on what timeline.
  Write it down now while it is cheap.
- A **training / sandbox mode** with synthetic videos and fake IDs, so new coders can practise the whole
  workflow without touching real data. This also gives us a safe demo for presentations.

## 14. Build order

I would rather have coders working in three weeks on something plain than in three months on something
complete. Propose a phasing along these lines and tell me if you disagree:

1. **Phase 1 — make coding possible.** Auth, roles, video list, Drive link, timestamped notes, context
   card form, scoring screen with rubric alongside, autosave, admin export. No calibration, no dashboards,
   no animation polish.
2. **Phase 2 — make it correct.** Calibration room with co-presence, gold set and certification,
   assignment algorithm, reassignment, reliability statistics.
3. **Phase 3 — make it good.** Dashboards, descriptive statistics for coders, embedded theatre-mode
   playback, transitions and motion, encouragement messages, imagery.

Design the Phase 1 schema so Phases 2 and 3 do not require a migration.

## 15. Stack and maintainability

- One language across front and back if possible. Boring, well-documented, widely used, still maintained
  in five years. No framework whose main appeal is that it is new.
- Everything reproducible from the repo: one documented command to run locally with synthetic seed data,
  one documented path to deploy. Environment variables documented in `.env.example`, never committed.
- Automated tests are required for: the blinding rules, the assignment algorithm's balance properties,
  the score encoding, and the export contract. I want to be able to change things later without fear.
- `README.md`, `CONTRIBUTING.md`, `docs/adr/`, and a `CLAUDE.md` describing conventions so that future
  sessions pick up the same rules. Conventional commits, small PRs, no direct commits to `main`.
- Accessibility to WCAG 2.2 AA — keyboard navigation throughout, visible focus, adequate contrast even
  with the cream/brown palette, and motion that respects `prefers-reduced-motion`. The transitions I asked
  for must never delay input or make the interface feel slow; treat 60fps and sub-100ms interaction
  response as a hard constraint that outranks the animation itself.

## 16. Questions I already know you should ask me

Answer these back to me as a numbered list with your recommendation for each, and I will confirm:

1. Is every one of the 536 videos double-coded (1,072 codings), or is only a subset double-coded for
   reliability with the rest single-coded? This drives the entire timeline.
2. Are pairs fixed for the whole project, or rotating? Rotating pairs give much better reliability
   estimates; fixed pairs are simpler to schedule. What do you recommend?
3. Consensus score: revised/agreed only, or also stored average?
4. What is the deadline for completing all coding, and is it fixed?
5. Do transcripts of the videos exist, and should the platform store or display them? (The manual refers
   to garbled transcripts, so something exists.)
6. Should coders see the context card that *another* coder wrote for the same video, or write independently?
   (I lean towards: first coder writes it, second reviews and amends, with both versions kept.)
7. Do we need multi-language support in the interface, or is English sufficient for all coders?
8. Who administers the Google Drive that holds the videos, and can that person grant API access?
9. What is our hosting budget per month, and who pays for it?
10. Who maintains this after the coding period ends?
