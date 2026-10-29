# i-ed-ltl-clobs

Classroom Observations coding platform for the **LTL Secondary** project (Uganda).

A web application in which trained enumerators watch recorded lessons, take timestamped notes, complete
context cards, score each lesson against the LTL observation instrument, and then calibrate in pairs to
reach a consensus score. Administrators assign videos, monitor progress and inter-rater reliability, and
export a tidy dataset for analysis and for training an automated coder.

**Status (2026-10-29):** built and deployed on Vercel + Neon. Three enumerator teams use it differently:

- **Narratives** (active): enumerators correct AI-written lesson narratives in a Word-like editor. Every
  change is saved on the device and on the server. Admins download the results as Word files.
- **Scoring** (kept for a future approved platform): coding, calibration, gold set, training and
  progress. In 2026 this work ran in ODK, because the platform was not IRB/DAT approved in time.
- **Context cards:** done in ODK; the platform only records team membership.

Start with `docs/STATUS.md` (current state), `docs/PLAN.md` (decisions D1–D7) and
`docs/06-handoff.md` (how to continue). Going live: `docs/09-narratives-deploy.md`.

## Running it locally with synthetic data

```
# a throwaway local Postgres (Homebrew PostgreSQL), once:
initdb -D /tmp/clobs-pg/data -U postgres --auth=trust
pg_ctl -D /tmp/clobs-pg/data -o "-p 54329" -l /tmp/clobs-pg/log.txt start

npm run test:local   # migrates, grants, seeds and runs every test against localhost:54329
```

`npm test` on its own refuses to run against a `neon.tech` database. Placeholder narratives (invented
content) are in `db/seed/narratives/`.

---

## ⚠️ Data classification — read before committing anything

The lesson recordings show **minors** and are **Harvard Level 3** data. So is much of what this platform
produces: coder justifications quote what specific pupils said and did, and context cards describe pupils'
uniforms, appearance and the adults present.

**No Level 3 data enters this repository. Ever.**

That means none of the following are ever committed, in any form, in any branch:

- video files, or anything derived from them frame-by-frame
- the real context cards, the pilot scoring workbooks, or any file containing coder justifications
- the video/teacher list, or any file mapping videos to schools, treatment arms, or teacher assignments
- database dumps, exports, `.env` files, credentials, service-account keys

The repository holds **code, schemas, documentation, and synthetic or redacted samples**. Real data lives
in Google Drive (see `data/README.md`) and, at runtime, in the application database.

Once a sensitive file is committed it is in the history and removing it is painful. Check `git status`
before every commit.

---

## Repository layout

```
.
├── README.md                    ← you are here
├── CLAUDE.md                    ← conventions for AI-assisted sessions; read before working
├── .gitignore
├── docs/
│   ├── 00-brief.md              the project brief
│   ├── 01-addendum.md           constraints, corrections and open decisions
│   ├── adr/                     architecture decision records, one file per decision
│   ├── rubric/                  the observation instrument (LaTeX source + compiled PDF)
│   └── source-materials/        redacted samples showing the shape of the existing data
├── data/                        local working data — GITIGNORED, never committed
├── app/                         Next.js pages and API routes (Scoring, Narratives, admin)
├── lib/                         query layers (lib/db), narratives (parser, sync engine, Word export)
├── components/                  UI; components/narratives/ is the Narratives area
├── db/                          schema + synthetic seeds; drizzle/ holds the migrations
└── tests/                       Vitest suites (blinding, teams, narratives, live saving, Word export, PIN)
```

## The instrument

Eight concepts, scored on one four-point ordered scale:

| Code | Label |
|------|-------|
| 1 | Column A — Very Accurate |
| 2 | Column A — Somewhat Accurate |
| 3 | Column B — Somewhat Accurate |
| 4 | Column B — Very Accurate |

Column B is always the positive end. The authoritative source is `docs/rubric/20260822_CLOBS.tex`;
the compiled PDF beside it is a convenience copy. Every score stored by the platform records the **rubric
version** it was scored against.

## Related

- **`i-ed-ltl-secondary`** — analysis code for the wider paper. This repository is a sibling, not a fork.
- **Google Drive:** `01-03 - LTL-Secondary-Data` (project data) and the HGSE Nourani Lab shared drive
  (recordings). Exact paths in `data/README.md`.

## Contact

María Otero Arango — maria_oteroarango@gse.harvard.edu
