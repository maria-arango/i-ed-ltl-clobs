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
6. Should coders see the context card that *anaother* coder wrote for the same video, or write independently?
   (I lean towards: first coder writes it, second reviews and amends, with both versions kept.)
7. Do we need multi-language support in the interface, or is English sufficient for all coders?
8. Who administers the Google Drive that holds the videos, and can that person grant API access?
9. What is our hosting budget per month, and who pays for it?
10. Who maintains this after the coding period ends?

---

# §17. Amendments

## Amendment A — one context card per video, 2026-08-28

Decided by the study team. **Supersedes §16 question 6**, and modifies §3, §6 and §12.

### The decision

The context card is **observational, not evaluative** — uniforms, room, camera position, the adults present
and what they wear. Two coders describing the same recording would produce near-identical cards, so the
second is wasted effort. Therefore:

- **One context card per video**, not one per coder.
- Of the two coders assigned to a video, **exactly one** is assigned to fill it.
- That assignment is **randomised**, and balanced so that each coder fills the card for roughly **half** of
  their own assigned videos — not merely half globally, which could leave one person doing all of them.
  Balance within each pair as well as within each coder's queue.
- Assignment happens at the same time as video assignment, from the same seed, and is recorded and
  reproducible like every other assignment decision.

### Consequences for the data model (modifies §3)

The context card now belongs to the **video**, not to the coder–video pair:

- `context_card_scenes` is keyed on `video_id, scene`, with an `authored_by` coder reference — not on
  `(video_id, coder_id, scene)`. Uniqueness is per video and scene.
- The assignment record carries a `fills_context_card` boolean per coder–video pair. Exactly one of the
  two coders on any video has it set to true.
- When a coder is reassigned, leaves, or a pair is dissolved, the context-card duty **transfers with the
  video** under the same reassignment rules as everything else (§6). If the assigned coder has already
  submitted the card, it stays and the duty does not transfer.

### Blinding — the non-authoring coder must not read the card before scoring

This needs a rule, because the card is not as neutral as it first appears. The `A1_behavior` field
describes what the teacher did, and the `timeline` field describes how the lesson unfolded. A coder who
reads "teacher moves between the desks for most of the lesson" before scoring concept 1 or concept 5 has
been influenced.

Therefore: a coder may **not** view another coder's context card for a shared video until they have
submitted their own individual scores for that video. Enforce this server-side and test it, alongside the
other blinding rules in `CLAUDE.md` §2. After submission it may be shown freely, and during calibration
both parties see it.

### A cheap second pair of eyes

Dropping the duplicate card also drops the only check on it — a wrong uniform description or a missed scene
change is now never caught, and the card is what lets the AI identify the setup. Recommended mitigation,
for approval:

After the non-authoring coder submits their individual scores, show them the card in a short read-only step
with two options: **Confirm** or **Flag a problem** (free-text reason). It takes about thirty seconds,
preserves most of the value of the second pass, and costs almost none of the effort the amendment was made
to save. Flagged cards go to an admin queue.

If this is adopted, the card record carries `confirmed_by`, `confirmed_at`, `flagged`, `flag_reason`.

### Consequences for the coder's flow

- The coder who fills the card is still told to do it **first**, before watching for notes — it orients them
  to the classroom (§ "The experience I picture").
- The other coder's flow starts at notes. Their observation is complete without a card; the interface must
  not show them an unfilled context-card step or count it against their completion.
- A **video** is not fully complete until both coders' scores exist *and* the single context card exists.
  Track that as a separate completion condition from per-coder completion, and show both on the admin
  dashboard so a video is not silently left cardless.
- Per-coder progress and time-on-task figures must remain comparable between coders who fill roughly half
  their cards and the videos where they do not. Report context-card time separately, never folded into
  scoring time.

### Consequences for the export (modifies §12)

- `clobs_context_cards` and `clobs_context_adults` become **one row per video × scene** (and per adult),
  which is simpler than before. Add `authored_by_coder_id`, and `confirmed_by_coder_id`, `flagged`,
  `flag_reason` if the confirmation step is adopted.
- `clobs_assignments` gains `fills_context_card`, so the randomisation of card duty is auditable and can be
  described in the paper alongside the video randomisation.

## Amendment B — decisions of 2026-08-30

Decided by María in review of `docs/02-plan.md` / `03-data-model.md` / `04-questions.md`. Modifies §3,
§7, §12, §13 and answers most of §16.

1. **Context cards lose the scene dimension.** One card per video (Amendment A stands), holding the
   general fields once — subject, composition, approx. count, uniforms, appearance caveats, room,
   camera, notes, timeline — plus one free-text field for the rare mid-recording setting change.
   Adults remain add/remove in the form. **The export is a single table**, one row per video, with the
   adults flattened into `A1_…A6_` blocks exactly matching `context_cards_v3.xlsx`, because that is the
   shape the AI-training pipeline was designed around. This supersedes the per-scene rows in §3 and
   §12 and the per-scene keying in Amendment A.
2. **Roles.** "Enumerator", "coder" and "observer" are one role: **coder**. The separate read-only
   PI/observer role from §13 is dropped. Added instead: a **chief-coder** flag on coder accounts.
   **Pairing rule:** every pair contains exactly one anchor (an admin or chief-coder) and one
   enumerator; enumerators are never paired together, and admins are not paired together. Admins also
   code full-time.
3. **Calibration has no escalation path.** Consensus per item is mandatory before sign-off — an anchor
   is present in every pair, so adjudication is built into the room. Who-moved and the consensus
   rationale (required where the two scores differed) are still recorded. Supersedes §7 point 1.
4. **Column B evidence is not enforced.** Coders may optionally attach note entries to a justification,
   but the platform never requires or nags for a timestamp citation; the training carries that norm.
5. **Consensus stored = the agreed score only**; averages are computed at analysis time (confirms §3).
6. **Identifiers.** From a filename like `11002_11002_29_11_EAST_BIOLOGY_comp.mp4`: `sid = 11002`
   (school), `tr_id = 11002_29` (teacher). Both must appear in every admin export and nightly backup.
   Coders see only the opaque display code (`V-0417`), which is also how they refer to videos between
   themselves and in calibration; the display-code ↔ true-ID crosswalk is admin-only.
7. **Scope.** Videos taught in Arabic, Kiswahili, Lusoga, Luganda, or French are excluded → **511
   codable videos**. ~25 videos previously coded by admins under the old rubric are recoded on the
   platform, each by one original admin coder plus one trained enumerator, flagged as a named batch
   with the prior coder's `previously_coded` recorded (list: `data/admin-recode-set.md`, local only —
   raw IDs never enter the repository). Gold-standard videos will likely come from this set (pending
   team meeting).
8. **Deadline.** Coding and calibration complete by **2026-10-30**; analysis starts the first week of
   November.
9. **Training space.** Uses the `dataset = 'training'` mechanism from ADR 0001. Trainee accounts are
   coder accounts scoped to `training`: they see only the admin-chosen training videos (~4: two coded
   alongside an experienced coder, two solo for evaluation), no calibration surface, and their work
   never enters live exports or dashboards. Evaluation against master scores uses the certification
   machinery; passing trainees are promoted by an admin flipping the account to `live` (audited).
10. **Housekeeping.** No transcripts (no budget). English-only interface. María José maintains the
    platform after the coding period; project data is archived, **not deleted**, at project end.

Additions of 2026-08-30 (second review):

11. **Import exclusion rule.** At video-list import, exclude (a) rows whose `tr_id` contains `(-666)`
    or `NO_TEACHER` (e.g. `"(-666)"`, `"10402_(-666)"`, `"11102_(-666)"`), and (b) lessons taught in
    Arabic, Kiswahili (incl. "Lugha ya Kiswahili" / "Faishi(a) ya Kiswahili"), Lusoga, Luganda, or
    French — coders cannot understand the speech. Excluded rows are kept in `video_provenance` with
    `excluded_reason`, never assigned, never in denominators. The codable count is computed at import,
    not assumed.
12. **Drive filenames — accepted disclosure.** The team discussed and accepts that coders see raw video
    filenames (which contain `sid`/`tr_id`) when watching in Drive; files will not be renamed. The
    platform's blinding rules stand unchanged for everything the platform itself serves: display codes
    everywhere in the interface, no school/arm/teacher fields in any coder-facing payload, and arm
    remains invisible everywhere (filenames do not reveal treatment arm). Recorded so a future session
    does not reopen this.
13. **Anchor roster (provisional).** Confirmed anchors: María, Aggrey, Justine. Probable chief-coders:
    Hamlet, Simon, Shaily (to be confirmed; profiles added later via the Team screen).

Additions of 2026-08-31 (workspace review, after María tried the demo):

16. **Notes are ONE rich-text document per observation** (supersedes the entry-list reading of
    §5 and refines Amendment B §15). No minute field. The editor offers a small formatting bar —
    bold, highlight, text size, alignment (left/center/justify), bulleted, numbered and dashed
    lists — "almost a Word page" — and the content is stored as HTML in `notes.body`
    (`clobs_notes` exports both the HTML and a derived plain-text column). The optional
    note→justification citation machinery remains in the schema but is not surfaced in v1.
17. **Workspace polish decisions.** Tab badges are live (scores count up 1/8…8/8 as items are
    scored; the notes tab shows a check once the note has content). Submitting scores shows a
    positive-reinforcement message (docs/05 pool) with the completion moment. The selected score
    chip is emphasised strongly but WITHOUT motion (DESIGN_SYSTEM §4 frequency gate stands):
    edge-colored numeral badge, bolder label, check mark, non-selected options dimmed.
    Within-video navigation stays as horizontal tabs; the app-level left sidebar arrives with
    the Stage 3 shell. Durations auto-fill during the Stage 3 Drive-link attachment step.

Additions of 2026-08-31 (video-unit decision and import findings):

14. **The coding unit is the teacher session, not the video file.** The mapping file is one row per
    teacher session; `video1..video4` are parts of one class recording, to be combined into a single
    compressed file named `{sid}_{tr_id}_{grade}_{stream}_{SUBJECT}_comp.mp4` (format as in the
    training folder). The platform imports **one video per session row** (538), keyed on the
    `sid_tr_id` filename prefix; real filenames and Drive links are attached later by prefix match.
    Import findings, resolved as follows:
    - **28 language-subject sessions excluded** → **510 codable** (this supersedes the 536/511/505
      counts; the platform's number is computed, not assumed).
    - **34 rows had a missing school arm**; 32 filled from other rows of the same school (arms are
      consistent within every school). **School 22103 (2 sessions) has no arm anywhere — imported
      with arm NULL, for María to resolve before assignment.**
    - **Three teachers have two sessions** (`10705_3`, `10705_1006`, `11201_17`) — both sessions
      imported as separate videos; their Drive files will need manual matching. **Two teachers were
      recorded at a school other than their own** (`11003_14` at 10701; `11004_24` at 10102) —
      `sid` records the recording school.
    - Live import completed with seed `ltl-clobs-live-2026-08-31`, batch `main-2026`, recorded in
      the audit log.
15. **Notes are free-form.** Coders are never required to attach a minute to a note. The notes
    editor is a plain writing surface; a single optional action ("stamp current time") inserts the
    video minute for coders who want it, and note→justification citations remain fully optional
    (Amendment B §4). This clarifies §5 of this addendum: the timestamp is a convenience, never a
    requirement.
Additions of 2026-08-31 (platform review, second round):

18. **Availability is entered as videos-per-day with date ranges.** Trained enumerators default to
    full time (3 videos/day). Admins and chief coders vary: each availability entry is
    (videos per day, from date, to date — open-ended allowed), editable on the Team screen, and
    history is preserved by closing the old entry rather than editing it. Examples set by María:
    María/Aggrey/Justine 3/day from ~Sept 11–14 to end of October; Shaily 2/day from Sept 16;
    Arya 1/day. **Wave capacity derives from availability**: a pair's capacity for a wave =
    min(anchor's, enumerator's) videos/day × the wave's working days, computed at preview time.
19. **Pair rotation.** Manual pair formation stays, and a seeded "rotate pairs" action is added:
    fixed pairs within a week, new randomised pairings between weeks (preferring combinations that
    have not worked together before). Rotation soft-dissolves the previous pairs (history intact —
    calibration still references the pair that coded together) and forms the new set, all recorded.
20. **Permanent deletion is allowed ONLY for accounts with no work.** An account with zero
    observations, notes, scores, assignments or audit trail can be hard-deleted (typo/duplicate
    entries). Any account with work can only be deactivated — CLAUDE.md §7 (nothing destructive)
    stands for anything evidentiary.
21. **Interface decisions.** A left sidebar with icons is the app-level navigation (Home, My
    videos, Team, Assignment; more as screens arrive) — plain blue text links were too easy to
    miss. Route changes get the 280ms page transition from the design system. UI copy avoids
    em dashes (reads as AI); instrument text is untouched. Kimanya photographs are approved for
    the sign-in/landing page.

Additions of 2026-08-31 (calibration review, third round):

22. **Training set is 6 videos** (2 good, 2 neutral, 2 bad classroom practices). Supersedes the
    "~4" in §9 of this addendum and Amendment B §9.
23. **Gold set is 6 videos** (2 good, 2 neutral, 2 bad). Three are chosen so far; the list lives
    in `data/gold-set.md` (raw IDs and Drive links never enter the repository). Master scores are
    entered after the rubric is final (recode plan agreed with Arya).
24. **Consensus may land on a third value** — a score neither coder chose individually — recorded
    as resolution "both moved" with a mandatory rationale. PROVISIONAL: María confirms with the
    admin team; if reversed, the room will restrict the final to one of the two submitted scores.
25. **Availability is planned per week on the Assignment screen** (supersedes the Team-screen
    editor of §18; the §18 data model stands). The weekly flow: pick the week's dates, tick who
    is working and set each person's videos/day, save (writes week-scoped availability entries;
    append-only), then preview and confirm the wave for that week — capacities use that week's
    plan. Coders see who their partner is per video on My videos and on the Calibration screen.
    The Team screen keeps accounts/roles only, with actions as labelled pill buttons.

Additions of 2026-08-31 (platform review, fourth round):

26. **Manual pair formation is removed from the interface.** Rotation (seeded, availability-aware,
    §19) is THE pairing mechanism; dissolving an empty pair remains for corrections, and the
    data-layer `createPair` stays for tests and emergencies. Refines §19's "manual pair formation
    stays".
27. **Depth and visible motion.** Cards, tables and form sections carry a soft resting shadow and
    interactive cards lift on hover; route changes use the design system's side-by-side slide
    (content pane only). Paragraph copy is never width-capped below its container. Recorded in
    DESIGN_SYSTEM §3 (elevation amendment) — the scoring grid stays flat and motionless.
