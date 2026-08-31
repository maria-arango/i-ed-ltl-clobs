# 04 — Decision log and remaining open questions

- **Status:** updated 2026-08-30 after María's review. Everything decided is now recorded in
  `docs/01-addendum.md` §17 **Amendment B** and reflected in `03-data-model.md`; this file keeps the
  short log and what is still open.

---

## Decided (see Amendment B for the full wording)

| Topic | Decision |
|---|---|
| Email domain | Bought: `ltl-classroom-observations.org`, verified on Resend. Sign-in codes send from it. |
| Drive service account | `clobs-backup@ltl-clobs-backup.iam.gserviceaccount.com`, editor on `_platform-backups/`. María administers the Drive. |
| Context cards | No scenes. One card per video, general fields once, `setting_change` free-text for the rare mid-recording change. Export = **one table**, one row per video, adults flattened `A1_…A6_` matching `context_cards_v3.xlsx`. |
| Roles | Two roles only: **admin** and **coder** (= enumerator = observer). New `is_chief_coder` flag. Trainees are coder accounts with `dataset_scope = 'training'`. |
| Pairing | Every pair = one anchor (admin or chief-coder) + one enumerator. Never enumerator×enumerator, never admin×admin. Fixed within a wave, rotated between waves. |
| Calibration | No escalation path — consensus per item is mandatory (the anchor is in the room). Who-moved + rationale (required when scores differed) recorded. Final score may be any of the four options. Co-presence mandatory; both sign; immutable after. |
| Column B evidence | Note citations available, never required or prompted. The norm lives in training. |
| Consensus | Agreed/revised score only; averages computed at analysis time. |
| Identifiers | `sid` (school) and `tr_id` (teacher) in every admin export and backup; coders see only display codes, which is also how videos are referred to in conversation and calibration. Crosswalk = `video_provenance`, admin-only. |
| Scope | Language-subject videos (Arabic, Kiswahili, Lusoga, Luganda, French) excluded → **511 codable**. All double-coded. |
| Admin recode set | ~25 previously admin-coded videos (list in `data/admin-recode-set.md`, never committed), each assigned to one original admin coder + one enumerator, batch-labelled, `previously_coded` flagged. Gold videos likely drawn from this set. |
| Deadline | Coding + calibration done by **2026-10-30**; analysis starts first week of November. |
| Transcripts / language | No transcripts (no budget). English-only interface. |
| Maintenance / archive | María José maintains after the coding period. Data is archived, **not deleted**. |
| Amendment A confirm/flag step | Adopted. |

---

## Still open

Resolved 2026-08-30 (second review; recorded in Amendment B items 11–13):
**O1** anchors = María, Aggrey, Justine confirmed; Hamlet, Simon, Shaily probable — profiles added
later. **O2** superseded by the precise import rule: exclude `tr_id` containing `(-666)` /
`NO_TEACHER` and the language-subject lessons; the count is computed at import. **O3** the team
accepts the filename disclosure; no renaming — platform-side blinding unchanged, and arm is never
revealed by a filename. **O4/O5** gold and training videos to be reported later (data entry, not build
work). **O6** Kimanya imagery decision expected 2026-08-31.

The original O1 capacity arithmetic still applies once the chief roster is fixed: anchors must jointly
produce ~511 codings (~1,022 h) by Oct 30 ≈ five full-time anchor equivalents.

### O1. Anchor capacity — decide how many chief-coders to approve **[decide before Stage 3, Day 5]**

The pairing rule has an arithmetic consequence worth seeing plainly: 511 videos × 2 = 1,022 codings,
and every video needs exactly one anchor coding, so **admins + chief-coders must personally produce
511 codings (~1,022 hours at ~2 h each)**. Between ~Sept 1 and Oct 30 there are ~8.5 working weeks;
leaving time for calibration, call it 7 weeks of coding at ~30 coding-hours/week per full-time person.
That requires roughly **five full-time anchors**. With three admins (María, Aggrey, Justine — and not
all at 100% FTE on coding), that means approving **at least 2–3 chief-coders** from the strongest
trained enumerators, early. The dashboard will track this against FTE, but the number of chiefs is
your call.

### O2. The enumerator-load number — 505 vs 486 **[confirm at import, Day 2]**

Your message says the enumerator load drops to **505**; the counts as given compute differently:
536 − 25 language-excluded = 511 codable; reserving the ~25-video recode set leaves 486 first
assignments for enumerator-anchored pairs (and under the pairing rule, enumerators appear in *all*
pairs anyway). Possibly some recode-set videos are also language-excluded, or one count is approximate.
No design consequence — the platform computes the true denominators from the mapping file at import
and shows them on the admin dashboard — but flag it so a number in a meeting doesn't harden.

### O3. Drive file names leak the school ID to coders **[decide before coders start]**

Coders watch videos in Drive itself, and the filenames look like `11002_11002_29_11_EAST_BIOLOGY_comp.mp4`
— the school and teacher IDs are on screen every time they watch, no matter what the platform hides.
Since you administer the Drive, **recommendation:** bulk-rename the video files to their display codes
(`V-0417.mp4`) once codes are generated at import — I can produce the rename script and a
crosswalk sheet for your records (the crosswalk stays in the platform and in `data/`, never in git).
The alternative — coders seeing raw filenames — makes the platform's blinding cosmetic.

### O4. Gold-standard set and threshold **[after your team meeting]**

Pending your meeting: which videos (likely from the recode set), who enters master scores, pass
threshold. Schema ships regardless; the certification gate activates whenever this is decided.

### O5. Training videos **[before enumerator training]**

Which ~4 videos the training space uses (2 guided, 2 solo-evaluation). Same mechanism as O4 — the
`training` dataset is in the first migration, so this is data entry, not build work.

### O6. Kimanya imagery **[Stage 5]**

You're asking for it — needs usage rights confirmed. Landing page only.

---

## How roles and the training space work — the clarity you asked for

**Adding anyone** (admin, coder, chief-coder, trainee) is one admin action on the Team screen: enter
their email, pick role, tick "chief-coder" or "trainee" if applicable. They receive a sign-in link,
enter the emailed one-time code, and they're in. No passwords, no self-signup, and every role change is
recorded in the audit log.

**Trainees** are ordinary coder accounts whose `dataset_scope` is `training` (ADR 0001's mechanism):

- They see the same interface — queue, context card, notes, scoring with the rubric — but **only** the
  training videos an admin assigned them, and **no calibration section** (feature-gated by scope).
- Everything they write is stamped `training` server-side and can never appear in live exports,
  dashboards, or statistics (tested, same as the blinding rules).
- Their solo-evaluation videos are compared against the master scores through the certification
  machinery — the admin dashboard shows each trainee's agreement, which is how you pick who survives
  training.
- Promoting a successful trainee = an admin flips their account from `training` to `live` (audited).
  Their training work stays behind in the training dataset; they start live coding clean.
- The `training` dataset survives the test-data purge, so the sandbox is never destroyed by
  housekeeping.
