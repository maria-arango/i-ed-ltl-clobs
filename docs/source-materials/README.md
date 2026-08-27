# `docs/source-materials/` — how the data looks today

These files show the **shape** of the information the platform has to replace. They exist so that the
schema can be designed against reality rather than against a description.

Everything here is **redacted or synthetic**. The real files contain identifiable content about minors and
are Level 3 data; they live in Google Drive and are copied to `data/raw/` locally when needed.

## Files

### `context_cards_SAMPLE.xlsx`

Redacted sample of `context_cards_v3.xlsx`. The header row and the field-instruction row are reproduced
from the real instrument; all data rows are invented.

The important structural facts:

- One row per **video × scene**, not one row per teacher. A video has more than one scene when the setting
  changes mid-recording (different room, different lesson). `from` / `to` are `MM:SS`, with `end` allowed.
- A repeating block for up to **six adults** — `A1`…`A6`, each with `role, sex, clothing,
  clothing_caveats, features, behavior, speaks`.
- A free-text `timeline` field carrying the sequence of the lesson.
- The second row holds the field-level instructions. In the platform these become inline help text on the
  form; they should not be lost.

The form must therefore let a coder **add and remove scenes**, and **add and remove adults within a
scene**, rather than presenting a fixed grid.

### `scoring_sheet_SAMPLE.xlsx`

Redacted sample of the pilot scoring workbook (`LTL_CLOBS_20_scores_stata.xlsx`). All names, scores and
justifications are invented.

The important structural facts:

- One sheet per video, one row per item, **eight items** in fixed order.
- Paired `NAME Score` / `NAME Notes / Justification` columns per coder.
- The number of coders per video **varies** (2 to 4 in the pilot) and the sheets are not consistent about
  which people. Production is pairs, but the data model should be *n raters per video*, with a pair as the
  normal case, so that a third rater or an adjudicator does not require a migration.
- Two final-score columns exist in the pilot — `Final Score - Revised` and `Final Score - Averaged`. The
  platform stores the **revised/agreed** score; any average is computed at analysis time.
- Missing values appear as the string `" ---"`. In the platform, "not yet entered" and "cannot be coded"
  are different states and must be stored differently. There is no "don't know" option — the rubric sends
  missing or ambiguous evidence to Column A — but there is a video-level **unusable** flag with a reason.

### What is *not* here

- **Notes.** Today they are prose in per-coder Google Docs, one tab per teacher, with no structure to show.
  The platform replaces them with timestamped entries that can be cited from a justification. See
  `docs/01-addendum.md` §5 — this is the single highest-value change.
- **The rubric.** It is the instrument itself, not a sample: see `docs/rubric/`.
- **The video list.** It carries school identifiers and treatment arms; see `data/README.md`.
