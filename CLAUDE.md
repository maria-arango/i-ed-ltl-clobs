# CLAUDE.md — conventions for this repository

Read this and `docs/00-brief.md` + `docs/01-addendum.md` before doing anything.

## What this is

A coding platform for a randomised education trial in Uganda. Enumerators watch recorded secondary-school
lessons, take notes, complete context cards, score eight concepts on a four-point scale, and calibrate in
pairs to a consensus score. The research validity of the study depends on this software behaving
correctly, so correctness and auditability outrank speed and cleverness everywhere.

The maintainer is a researcher, not a software engineer. Choose boring, well-documented, widely used
technology. Explain trade-offs in plain language. Never leave the repository in a state that only you
understand.

## Non-negotiables

1. **No Level 3 data in git.** No videos, no real context cards, no justifications, no video↔school↔arm
   mapping, no exports, no `.env`. Everything real lives under `data/`, which is gitignored. Before any
   commit, check `git status` and question anything unexpected.
2. **Blinding is a server-side rule, not a UI rule.** Coders must never be able to obtain — through the
   interface, the API, a URL, an error message, or an export — the school, treatment arm, or teacher-level
   assignment of a video, nor another coder's scores or justifications for a shared video before that
   pair's calibration session for that video has been opened by both parties. Every such rule needs a test.
3. **Raw video IDs are blinding leaks.** They encode the school (`10102_9` → school `10102`). Coder-facing
   surfaces show only the opaque display code (`V-0417`). The mapping is admin-only.
4. **Score encoding is fixed.** `1 = A Very`, `2 = A Somewhat`, `3 = B Somewhat`, `4 = B Very`. Store the
   numeric value, the column (`A`/`B`) and the degree (`somewhat`/`very`) as separate fields. Never
   reorder, never re-map, never infer one from a label string at read time.
5. **Rubric content is data, not code.** It lives in the database or in generated structured files, never
   hard-coded in components. Every stored score carries the rubric version it was scored against.
6. **Individual scores lock on submission.** A calibrated score is only evidence if the individual scores
   that preceded it could not be edited afterwards.
7. **Nothing is destructive.** Reassignment, regrouping and voiding preserve completed work and record a
   reason. Prefer soft deletes and an append-only audit log.

## Working method

- **Plan before code.** For any non-trivial change: state the plan, get approval, then implement. For
  decisions that are expensive to reverse — auth, hosting, database, video delivery, realtime layer —
  write an ADR in `docs/adr/NNNN-short-title.md` (context / options / decision / consequences) and get it
  approved before implementing.
- **Ask rather than assume.** Where the brief is ambiguous, ask. A wrong assumption baked into the schema
  costs weeks. Group questions as: blocks the plan / blocks the build / can wait.
- **Small, reviewable changes.** One concern per branch and per pull request.

## Git

- `main` is always deployable. No direct commits to `main`.
- Branches: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Conventional commit messages: `feat: add calibration room`, `fix: lock scores on submit`.
- Never rewrite published history. Never force-push `main`.
- Never commit anything under `data/`.

## Testing

Automated tests are required for, at minimum:

- the blinding rules (§2 and §3 above), tested at the API layer, not the UI layer
- the assignment algorithm's balance properties across arm, school and coder, and its reproducibility
  from a fixed seed
- the score encoding and the score/label round trip
- the export contract — column names, types, row counts, and the codebook

## Style

- One language across front and back where possible. Types on. Formatter and linter configured and run in CI.
- Accessibility to WCAG 2.2 AA: keyboard navigation throughout, visible focus, contrast checked against the
  cream/brown palette, and all motion behind `prefers-reduced-motion`.
- Motion never delays input. Sub-100 ms interaction response and 60 fps outrank any transition effect.
- Every text input autosaves locally and syncs when the connection returns. Coders work on variable
  bandwidth; losing two hours of notes is unacceptable.
- Documented environment variables in `.env.example`. One documented command to run locally with
  synthetic seed data. One documented path to deploy.
