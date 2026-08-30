# ADR 0001 — Hosting, stack, and storage

- **Status:** accepted (María, 2026-08-28)
- **Scope:** where the platform runs, what it is built with, where the data is kept and backed up

## Context

The platform must be usable by enumerators within roughly a week and stops being needed around
6 November 2026. It is maintained by a researcher, not a software engineer.

**Data classification, as determined by the study team against the IRB protocol:** the **video recordings
are Level 3** and never leave Google Drive — the platform links to or embeds them and never stores,
copies, proxies or re-hosts them. Everything the platform itself stores — notes, scores, justifications,
context cards, accounts, audit log — is **not Level 3** and may be held in ordinary managed hosting.

One thing in the database is nonetheless confidential for research reasons rather than privacy ones: the
**video → school → treatment-arm mapping**. Exposure to a coder destroys blinding and invalidates the
study. It is protected by access control and tested blinding rules (see `CLAUDE.md` §2–3), not by hosting.

Because the app's data is not Level 3, no HUIT security review gates this decision and hosting can be
chosen on engineering merit alone.

## Decision

**Managed components, containerised, on free tiers, with an automated nightly backup into Google Drive.**

| Layer | Choice |
|---|---|
| Code | GitHub, private: `i-ed-ltl-clobs` |
| Language | TypeScript, front and back |
| UI | **React** via **Next.js** (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Motion | Framer Motion, behind `prefers-reduced-motion` |
| Database | **PostgreSQL** on a managed free tier (Neon: 0.5 GB per project, no expiry, scales to zero) |
| DB access | Drizzle ORM — typed schema and migrations committed to the repo |
| Auth | Auth.js with the PostgreSQL adapter, email one-time codes — our own tables, no third-party identity provider |
| Mail | one transactional provider behind a single-function interface |
| Hosting | Vercel (free) for the app |
| Container | Dockerfile + `docker compose` maintained from day one |
| CI | GitHub Actions — lint, typecheck, test on every PR |
| Backup | scheduled job writing exports into Google Drive nightly (see below) |

**AWS is not used.** The argument for it was that a Harvard-contracted AWS account is approved for Level 3
data. With the app's data not being Level 3, that argument does not apply, and nothing else about AWS is
better for a ten-week, single-maintainer project: an EC2 instance means owning OS patching, TLS
certificates, a reverse proxy, database backups and restores, monitoring and firewall rules — days of work
that produce no feature. A personal AWS free-tier account is additionally rejected because it closes when
its credits are exhausted, taking the database with it.

The Dockerfile is kept working and tested from day one anyway. It costs almost nothing and means that if
the project ever does need to move onto a Harvard-contracted account, that is a `pg_dump`, the same image
redeployed, and a DNS change — not a rewrite.

## Storage — sizing

The concern is that 1,072 codings' worth of justifications, notes and context cards is "a lot of text."
It is not. Text is small; only video is large.

| Content | Volume | Estimated size |
|---|---|---|
| Justifications | 1,072 codings × 8 items ≈ 8,600, at ~400 characters | ~3.5 MB |
| Video notes | 1,072 note sets at ~6,000 characters | ~6.5 MB |
| Context cards | ~800 scene rows at ~2,500 characters | ~2 MB |
| Calibration records | 536 videos × 8 items | ~1.5 MB |
| Accounts, assignments, audit log | small | ~2 MB |
| **Subtotal** | | **~15 MB** |
| Event log (timing instrumentation) | ~250,000 rows at ~150 bytes | ~38 MB |
| Indexes and Postgres overhead | roughly ×2 | |
| **Total** | | **well under 150 MB** |

Against a 0.5 GB free tier that is comfortable, with the event log as the only line item that could grow
unexpectedly. Mitigation: the nightly backup writes the event log to Drive, and rows older than 60 days are
deleted from the database. Nothing is lost and the working set stays small.

For scale: a single 45-minute lesson recording is 500 MB to 1 GB. **The entire written output of this
project is smaller than one video.** This is exactly why the videos stay in Drive and the text goes in a
database — each is in the place that suits it.

## Backup into Google Drive

The database cannot *live* in Drive — Drive is file storage, not a database: no concurrent writes, no
transactions, no querying, and two coders saving at once would overwrite each other. But Drive is the right
place for the backup, and it answers the storage worry properly.

A scheduled job (GitHub Actions, nightly) connects to the database, generates the full export set, and
writes it into a Drive folder via a service account:

```
01-03 - LTL-Secondary-Data/.../Classroom-Observations/_platform-backups/
    2026-09-14/
        clobs_scores_long.csv
        clobs_scores_wide.csv
        clobs_notes.csv
        clobs_context_cards.csv
        clobs_context_adults.csv
        clobs_calibration.csv
        clobs_assignments.csv
        clobs_events.csv
        database.dump          ← full pg_dump, for a real restore
        MANIFEST.txt           ← row counts, rubric version, timestamp
```

This gives three things at once: a backup the team can see and verify without a developer; continuity if
anything happens to the hosting; and the daily working dataset in the place the team already lives. Drive
storage is institutional and already paid for, so it costs nothing.

The restore procedure is documented in the repository and **tested once before enumerators start**. An
untested backup is not a backup.

## Test data without a second environment

Rather than juggling test and production credentials:

- Every table holding coder-generated content has a non-null `dataset` column ∈ `{live, test, training}`,
  stamped server-side from the acting account's flag, never settable by the client.
- Accounts are flagged `live`, `test` or `training`; a test account can only write `test` rows.
- Every export, dashboard aggregate and progress count filters to `dataset = 'live'` through one shared
  query layer — not by remembering a `WHERE` clause. A test asserts no export path can emit a non-live row.
- One admin action purges all `test` rows transactionally and records it in the audit log.
- `training` behaves like `test` but survives the purge, so the enumerator sandbox is not destroyed when
  the maintainer clears her own experiments.

Local development uses a throwaway PostgreSQL from `docker compose` and is separate from all of this.

## Build order

The full application is to be built in one week. Order still decides whether day 7 ends with something
usable or with everything at 80% and nothing working end to end, so it is fixed here:

1. **Foundation** — schema (including `dataset` from the first migration), auth, roles, admin video import.
2. **The coding path** — video list, Drive link, context cards, timestamped notes, scoring with the rubric
   alongside, autosave, completion states. A coder can now code a video end to end.
3. **Assignment and calibration** — randomisation with balance constraints, the calibration room with
   co-presence, score locking.
4. **Admin and export** — dashboards, reliability statistics, exports, the nightly Drive backup.
5. **Polish** — transitions, embedded playback, encouragement messages, accessibility pass.

Anything cut for time is cut from the end of that list, never the middle.

## Consequences

**Good.** Nothing is blocked on institutional approval. Hosting costs nothing. The maintainer never becomes
a system administrator. The backup lands somewhere the team already trusts and can verify by looking. The
Docker path keeps a Harvard-hosted future open at almost no cost.

**Bad.** Free tiers can change their terms, and a Vercel Hobby project is nominally non-commercial — if
either becomes a problem, the containerised build means moving is a day, not a rewrite. The nightly backup
is load-bearing and must be verified early rather than assumed.

**Watch.** The event log is the one table that could outgrow the free tier; the 60-day roll-off is not
optional.

## References

- Neon free tier: 0.5 GB per project, no expiry, scale-to-zero —
  <https://neon.com/faqs/managed-postgres-databases-free-tier>
- Harvard data security levels — <https://privsec.harvard.edu/classify-risk>
