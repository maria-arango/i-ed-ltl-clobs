# `data/` — local working data, never committed

Everything in this folder except this README and `.gitignore` is ignored by git. This is where real
project data sits **on your machine only**, so that the application and AI-assisted sessions can read it
during development without any of it entering the repository.

If you ever see a file from this folder appear in `git status` as staged or untracked-and-about-to-be-added,
stop and fix `.gitignore` before committing.

## Expected layout

```
data/
├── README.md                 (committed)
├── .gitignore                (committed)
└── raw/                      (ignored) — copies of source files, read-only
    ├── 00_selected_teachers_rand.dta      the 536-video list + randomisation
    ├── context_cards_v3.xlsx              real context cards
    └── LTL_CLOBS_20_scores_stata.xlsx     pilot scoring workbook
```

Treat `data/raw/` as read-only. Never edit a file there; derive from it.

## Where the authoritative copies live

**Video list and randomisation** (`00_selected_teachers_rand.dta`) — Google Drive:

```
01-03 - LTL-Secondary-Data/01-03-Data/05_Output/04_Classroom-Observations/2024/00_selected_teachers_rand.dta
```

Full local mount path:

```
~/Library/CloudStorage/GoogleDrive-majo.oteroa@gmail.com/.shortcut-targets-by-id/1MdzdeIxVP4EsR9E4NmslHiq2h9ag8GAi/01-03 - LTL-Secondary-Data/01-03-Data/05_Output/04_Classroom-Observations/2024/00_selected_teachers_rand.dta
```

This file contains school identifiers and treatment arms. It is the source of the blinding risk: the
platform loads it admin-side only, and the coder-facing API must never be able to return school, arm, or
teacher-assignment fields.

**Recordings** — currently in the HGSE Nourani Lab shared drive; **final location not yet decided**:

```
~/Library/CloudStorage/GoogleDrive-maria_oteroarango@g.harvard.edu/Shared drives/HGSE Nourani Lab Embedded Development Lab/01-LTL/Classroom-Observation-Coding/01_Training/03c_Videos
```

Drive link: <https://drive.google.com/open?id=1yha_S278xEwD4Af8utOczb9H8i4cy5wd&usp=drive_fs>

The recordings are Level 3 data and never leave Google Drive. The platform links to or embeds them; it
never stores, copies, proxies or re-hosts them. Because the final location is undecided, the application
must resolve a video to a Drive URL through a **single configurable mapping** (a table or a config file),
never through a hard-coded folder path — so that moving the videos is a one-line change.

**Context cards and pilot scoring workbooks** — Google Drive, alongside the coding materials. Redacted,
structure-only samples of both are committed in `docs/source-materials/` for schema reference.

## Synthetic data

Seed data for local development and for the coder training/sandbox mode is **synthetic** and lives with
the application code (not here), so that anyone can clone the repository and run it with no access to
real data.
