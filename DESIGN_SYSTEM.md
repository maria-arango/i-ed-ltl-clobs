# LTL CLOBS — Design System

> Warm paper observatory. Cream canvas, ink hairlines, a bark-brown action, and one ordinal
> sand-to-lake ramp carried straight out of the printed manual.

**Theme:** light only (no dark mode in v1 — coders work in daylight classrooms and shared offices,
and a second theme doubles the contrast-checking surface for no research benefit)

---

## 0. How to use this file

**This file outranks every design skill installed in this repository.** When `impeccable`,
`design-taste-frontend`, `emil-design-eng`, `apple-design`, `transitions-dev` or any other skill
proposes something that contradicts a token, a rule, or a Don't below, this file wins and the skill
is applied *within* these constraints. Precedence, highest first:

1. `CLAUDE.md` — correctness, blinding, accessibility, and the sub-100ms input rule
2. **This file** — every visual and motion decision
3. `docs/00-brief.md` + `docs/01-addendum.md` — what the screens must do
4. Design skills — *how* to execute, never *what* to choose

Never invent a color, radius, duration, or font size that is not in this file. If something is
genuinely missing, add it here first, in the same table format, and say so — then use it.

### What this product is

A **data-entry and judgement tool** that fourteen people will sit inside for six hours a day for ten
weeks. It is not a landing page, not a portfolio, and not a marketing site. That single fact governs
most of what follows: the interface must stay quiet, stay out of the way, and never make a coder wait
for an animation before they can type. Delight is rationed to the moments that deserve it — finishing
an observation, closing a calibration — and absent everywhere else.

> Note on `design-taste-frontend`: that skill states it is for "landing pages, portfolios, and
> redesigns — **not** dashboards, not data tables, not multi-step product UI." Almost every screen
> here is exactly what it excludes. Use it only for the landing/sign-in page. Do not apply it to the
> coding surfaces.

---

## 1. Tokens — Color

### Canvas and surfaces

| Name | Value | Token | Role |
|------|-------|-------|------|
| Paper | `#FBF8F1` | `--clobs-paper` | Page canvas. The unbroken ground under everything. Never `#ffffff`. |
| Card | `#F5F1E8` | `--clobs-card` | Cards, panels, the rubric pane, the notes pane. One step down from paper. |
| Sunken | `#EDE8DC` | `--clobs-sunken` | Input wells, table header rows, code blocks, the video frame backing. |
| Hairline | `#DFD8C8` | `--clobs-hairline` | The default 1px border on every card, input, table cell and divider. |
| Hairline Strong | `#C9C0AC` | `--clobs-hairline-strong` | Group boundaries, active table row edge, focused input border. |

Depth is built from these five values and nothing else. Cards sit on paper and are read as cards
because of a hairline and a radius, not because they float.

### Ink

| Name | Value | Token | Role | Contrast on Paper |
|------|-------|-------|------|-------------------|
| Ink | `#23201A` | `--clobs-ink` | Headings, body text, table values, scores. Warm near-black, never `#000`. | 15.1:1 |
| Graphite | `#57524A` | `--clobs-graphite` | Secondary text, rubric body prose, column headers, helper text. | 8.0:1 |
| Smoke | `#6F695E` | `--clobs-smoke` | Muted metadata, timestamps, counts, captions. Smallest text still allowed as body. | 5.9:1 |
| Ash | `#9A9284` | `--clobs-ash` | Placeholders and disabled labels **only**. Never body text, never a value a coder must read. | 3.1:1 |

### Action and state

| Name | Value | Token | Role |
|------|-------|-------|------|
| Bark | `#5C4630` | `--clobs-bark` | The single primary action fill. Filled buttons, active nav, the completion bar. Paper-colored text on top. |
| Bark Deep | `#48351F` | `--clobs-bark-deep` | Bark hover and pressed state. |
| Lake | `#2C5C8F` | `--clobs-lake` | Links, focus rings, the "you are here" marker, informational icons. Never a button fill. |
| Lake Wash | `#DCE6F1` | `--clobs-lake-wash` | Selected row, active tab underlay, live-presence chip background. |
| Forest | `#3F6B4F` | `--clobs-forest` | Completion and saved states only. A signal, never an action. |
| Forest Wash | `#DEEADF` | `--clobs-forest-wash` | Completed chip and progress-bar fill. |
| Clay | `#9E3B2E` | `--clobs-clay` | Errors, unsaved-changes warnings, destructive confirmation, flagged context cards. |
| Clay Wash | `#F6E2DE` | `--clobs-clay-wash` | Error field background, flag banner. |

**Bark is rationed to one filled button per view.** If a screen has two brown buttons, one of them is
wrong — demote it to the outline variant.

### The score ramp — the most important color decision in the product

The four options are **ordinal, not good-and-bad**. Column A Very Accurate means *the practice was
absent*, which is a legitimate finding about a lesson, not a failure. A red-to-green scale would tell
coders they are marking teachers down, and would bias scores upward. So the ramp runs **warm sand →
neutral → cool lake**, lifted directly from the gradient already used in the printed manual
(`docs/rubric/20260822_CLOBS.tex`) so that the screen and the paper agree.

| Score | Label | Fill | Token | Border when selected |
|-------|-------|------|-------|----------------------|
| 1 | Column A — Very Accurate | `#F2D3B3` | `--clobs-score-1` | `#C98B4C` |
| 2 | Column A — Somewhat Accurate | `#EDE2D2` | `--clobs-score-2` | `#B9A88C` |
| 3 | Column B — Somewhat Accurate | `#D3DFEC` | `--clobs-score-3` | `#7C9CBF` |
| 4 | Column B — Very Accurate | `#A8C6E8` | `--clobs-score-4` | `#4A7CB0` |

Rules for the ramp:

- Every fill carries `--clobs-ink` text. All four pass AA at 14px and above.
- **Color is never the only signal.** Every score chip shows its numeral *and* its label. A coder must
  be able to read the score with the monitor in greyscale.
- The ramp is warm→cool, which stays ordered under deuteranopia and protanopia. Do not "improve" it
  into red→green.
- Use the ramp for scores only. Never for progress bars, never for arms, never for coder identity.
- In the calibration room, the two individual scores and the consensus score all use the same ramp.
  Difference is shown by position and a connector, not by a different palette.

### Colors that must never appear

Treatment arm (control / dispersed / connected) has **no color, no icon, and no visual encoding
anywhere in the coder-facing interface**, because it must not exist there at all. On admin screens it
is plain text. School is the same. This is a blinding rule (`CLAUDE.md` §2), and a designer's instinct
to "color-code the categories" is exactly how it gets leaked.

---

## 2. Tokens — Typography

Three families, three jobs. Hierarchy comes from **size and tracking**, not from bold weights — this
is the shared signature of every reference in `docs/design-references/`.

### Newsreader — the manual's voice
`--clobs-font-serif` · Variable serif, Google Fonts · Weights 400, 500 · Substitute: Iowan Old Style, Georgia

Used for rubric content and nothing else: concept statements, the Importance of Concept paragraph,
anchor descriptions, examples, and the Special Note. The instrument is a manual, and it should read
like one — a serif signals "this is the text you reason from", visually distinct from the interface
around it. Also used for page-level display headings.

### Inter — the interface
`--clobs-font-sans` · Variable, Google Fonts · Weights 400, 500, 600 · Substitute: system-ui

Everything else: navigation, buttons, labels, form fields, tables, dashboards, notes the coder types,
toasts, empty states. Weight 600 only for button labels and table headers.

### JetBrains Mono — the data
`--clobs-font-mono` · Weights 400, 500 · Substitute: ui-monospace, SFMono-Regular, Menlo

Functional, not decorative. Used where fixed advance width does real work: video display codes
(`V-0417`), note timestamps (`00:14:32`), elapsed session time, row counts, export filenames, and any
numeric column in a table. Tabular figures on, always.

### Scale

| Role | Size | Line height | Tracking | Family | Token |
|------|------|-------------|----------|--------|-------|
| micro | 11px | 1.45 | +0.02em | sans | `--clobs-text-micro` |
| caption | 12px | 1.5 | +0.01em | sans | `--clobs-text-caption` |
| body-sm | 14px | 1.55 | +0.005em | sans | `--clobs-text-body-sm` |
| body | 15px | 1.6 | 0 | sans | `--clobs-text-body` |
| body-lg | 17px | 1.65 | 0 | sans | `--clobs-text-body-lg` |
| prose | 17px | 1.7 | 0 | **serif** | `--clobs-text-prose` |
| prose-lg | 19px | 1.65 | 0 | **serif** | `--clobs-text-prose-lg` |
| heading-sm | 20px | 1.3 | −0.01em | sans | `--clobs-text-heading-sm` |
| heading | 26px | 1.25 | −0.015em | sans | `--clobs-text-heading` |
| display | 36px | 1.15 | −0.02em | **serif** | `--clobs-text-display` |
| display-lg | 52px | 1.08 | −0.025em | **serif** | `--clobs-text-display-lg` |

`display-lg` appears on the sign-in page and nowhere else. Inside the application, `heading` is the
largest type on any screen — a coding tool does not need a 52px headline above a scoring grid.

**Minimum sizes.** Nothing a coder must read drops below 12px. Rubric prose never below 17px: they
read it hundreds of times and eye strain is a real cost over ten weeks. Note and justification
textareas use `body-lg` at 17px.

---

## 3. Tokens — Space, shape, elevation

**Base unit: 4px.** Every gap, pad and inset is a multiple.

| Token | Value | | Token | Value |
|-------|-------|---|-------|-------|
| `--clobs-space-1` | 4px | | `--clobs-space-6` | 24px |
| `--clobs-space-2` | 8px | | `--clobs-space-8` | 32px |
| `--clobs-space-3` | 12px | | `--clobs-space-10` | 40px |
| `--clobs-space-4` | 16px | | `--clobs-space-12` | 48px |
| `--clobs-space-5` | 20px | | `--clobs-space-16` | 64px |

### Two densities, chosen by context

| Density | Where | Row height | Card padding | Section gap |
|---------|-------|-----------|--------------|-------------|
| **Comfortable** | Rubric pane, notes, context card form, sign-in, empty states | — | 24px | 48px |
| **Compact** | Video queue table, admin dashboards, calibration grid, assignment tables | 40px | 16px | 32px |

Reading and writing get room. Scanning and comparing get density. Do not apply one globally.

### Radius

| Element | Value | Token |
|---------|-------|-------|
| Cards, panels, modals | 16px | `--clobs-radius-card` |
| Buttons, inputs, selects, textareas | 10px | `--clobs-radius-control` |
| Score chips, tags, status pills, avatars | 9999px | `--clobs-radius-pill` |
| Table containers, video frame, images | 12px | `--clobs-radius-frame` |
| Inline code, small badges | 6px | `--clobs-radius-sm` |

**Buttons are not pills.** A 10px radius on a rectangular button reads as a tool; a fully-pilled button
reads as marketing and wastes horizontal space in a dense form. Pills are reserved for things that are
genuinely token-shaped: score chips, status, tags, presence avatars.

### Elevation

Hairlines first, always. There is exactly one shadow in the system, and it is for things that
genuinely float above the page and can be dismissed:

```
--clobs-shadow-float: 0 1px 2px rgba(35, 32, 26, 0.04),
                      0 8px 24px rgba(35, 32, 26, 0.08);
```

Allowed on: popovers, dropdown menus, tooltips, modals, toasts, the floating video panel in theatre
mode, and the dock. **Forbidden on cards, tables, form sections, dashboard tiles and the rubric pane** —
those are defined by `1px solid var(--clobs-hairline)` and a radius. No blurs, no glows, no gradients
on UI chrome.

### Focus

```
outline: 2px solid var(--clobs-lake);
outline-offset: 2px;
```

Visible on every interactive element, from keyboard only or always — never removed, never replaced by
a color change alone. WCAG 2.2 AA, and coders will keyboard through the scoring grid all day.

---

## 4. Motion

The rule from `CLAUDE.md`: **motion never delays input.** Sub-100ms interaction response and 60fps
outrank any transition effect. Everything below serves that.

### Duration and easing

| Token | Value | Use |
|-------|-------|-----|
| `--clobs-dur-instant` | 90ms | Press states, hover, checkbox, focus ring |
| `--clobs-dur-fast` | 150ms | Tooltips, chip selection, icon swaps, toasts entering |
| `--clobs-dur-base` | 220ms | Tabs, accordions, panel reveal, dropdowns |
| `--clobs-dur-page` | 280ms | Route transitions, side-by-side page slide |
| `--clobs-dur-moment` | 420ms | Success check, calibration reveal. Twice per hour at most. |

| Token | Curve | Use |
|-------|-------|-----|
| `--clobs-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Everything entering or expanding |
| `--clobs-ease-in` | `cubic-bezier(0.64, 0, 0.78, 0)` | Everything leaving (exits only) |
| `--clobs-ease-inout` | `cubic-bezier(0.65, 0, 0.35, 1)` | Position changes both ways |

Never `transition: all`. Name the properties. Animate `transform` and `opacity`; animating `width`,
`height`, `top` or `left` on anything a coder touches is a defect.

### The frequency gate — where motion is forbidden

Applying Emil's rule (`.claude/skills/animate`) to this product's actual usage:

| Surface | Times touched per coder per day | Motion allowed |
|---------|-------------------------------|----------------|
| Score selection (8 per video × 3 videos) | ~25 | **None.** Instant fill and border change. |
| Note entry, timestamp capture | 50–150 | **None.** State change only. |
| Autosave / saved indicator | continuous | **None.** Cross-fade opacity at 90ms, no movement, no spinner. |
| Rubric item navigation | ~25 | Near-imperceptible only — 150ms opacity, no slide. |
| Tab switches within a video | ~15 | Sliding tab indicator at `--clobs-dur-base`. |
| Page/route change | ~20 | Side-by-side slide at `--clobs-dur-page`. |
| Observation completed | 3 | **Full moment.** Success check + confetti. |
| Calibration completed | 1–2 | **Full moment.** |
| Sign-in | 1 | Full canvas reveal. |

Do not run `find-animation-opportunities` against the coding surfaces. The correct number of
animations on the scoring grid is zero, and a skill whose job is to find opportunities will find them.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  /* every transform-based transition collapses to opacity or nothing */
  /* confetti does not render at all — the success check still does, without motion */
}
```

This ships with each animation, not as a follow-up pass.

---

## 5. Component inventory — what to use where

The libraries below are already installed or available in this repository. This table is the mapping;
do not substitute a hand-rolled widget where a listed source exists, and do not introduce a library
that is not listed without adding it here first.

### Application shell

| Element | Source | Notes |
|---------|--------|-------|
| Sidebar navigation | `beautifului.dev` → sidebar-nav | Collapsible. Home, My videos, My progress, Calibration, (admin: Team, Assignment, Export). |
| Dock | `@beui/dock` | Optional secondary nav for the in-video workspace: Video · Context card · Notes · Scores. Only if it beats tabs in testing — do not ship both. |
| Breadcrumb + back | hand-rolled | **Required by the brief.** Back always returns to the immediately previous page. Home icon always present. Never rely on browser back alone. |
| Page transition | `transitions-dev` → `08-page-side-by-side` | Forward slides left, back slides right. Direction must match navigation direction or it disorients. |
| Tabs | `transitions-dev` → `16-tabs-sliding` | Within a video workspace. |
| Toasts | Sonner (`ask-sonner` skill) | Saved, sync restored, error. Bottom-right, 4s, never for score confirmation. |
| Tooltips | `transitions-dev` → `17-tooltip` | Rubric term glossary, icon-only buttons. |

### The coding workspace

| Element | Source | Notes |
|---------|--------|-------|
| Video panel | hand-rolled + Drive embed | Theatre mode top, collapsible, resizable. Falls back to a link card if embedding fails. |
| Video link card | `transitions-dev` → `24-learn-more-hover` | The darker rectangle with display code and Drive link from the brief. |
| Copy link button | `amicro` → btn-4 | Copy-state feedback. |
| Notes editor | hand-rolled | Timestamped entries. Mono timestamp, sans body. **No motion.** |
| Rubric pane | hand-rolled, serif | Sticky beside the scoring grid. Importance / Indicators / Special Note always visible. |
| Score chips | hand-rolled, score ramp | Numeral + label + fill. Selected = 2px ramp border. Instant. |
| Score guidance callout | `transitions-dev` → `18-texts-reveal` at 150ms | Appears under the selected chip with that option's anchor text. |
| Context card scenes | hand-rolled + `21-accordion` | Add/remove scenes and adults. |
| Completion button | `amicro` → btn-24, then `10-success-check` | Per section, then per observation. |
| Confetti | **not in the local skill set** — install `canvas-confetti` | Only on full observation and full calibration. Never per item. |
| Panel reveal | `transitions-dev` → `07-panel-reveal` | Notes ↔ scores side-by-side toggle. |

### Dashboards and tables

| Element | Source | Notes |
|---------|--------|-------|
| Video queue / progress table | `beautifului.dev` → filter-table | Compact density. Coder and admin. |
| Insight cards | `beautifului.dev` → insight-cards | Videos done, videos left, median time, agreement rate. |
| Animated counters | `@beui/number` or `transitions-dev` → `26-spinning-counter` | Dashboard only. Pick one and use it everywhere — not both. |
| Charts | Recharts, tokens from this file | Score distribution per concept, agreement over time. Score ramp for score data only. |
| Skeletons | `transitions-dev` → `14-skeleton-reveal` | Table and card loading. |
| Loading text | `transitions-dev` → `15-shimmer-text` | Long operations (export generation) only. Not for page loads. |
| Notification badge | `transitions-dev` → `03-notification-badge` | New assignments, deadline reminders. |

### Calibration room

| Element | Source | Notes |
|---------|--------|-------|
| Presence avatars | `transitions-dev` → `11-avatar-group-hover` | Who is in the room. Both required before Start unlocks. |
| Live presence chip | Lake wash + Forest dot | "Both here" state. |
| Side-by-side compare | hand-rolled, compact | Two justifications, two score chips, one consensus selector. |
| Sign-off | `25-checkbox-check` then `10-success-check` | Both parties, then complete. |

### Sign-in and landing

| Element | Source | Notes |
|---------|--------|-------|
| Sign-in flow | `21st.dev` → `aghasisahakyan1/sign-in-flow-1` | **Must be re-themed.** See §6. |
| Dotted background | `21st.dev` → `sshahaider/dotted-surface` | Landing/sign-in only. Never behind a working screen. |
| Fluid orb | `rare-ui/fluid-orb` | At most one instance, on the landing page. Optional. |

`3d-tilt` (`19-card-tilt`) is available but should appear on the landing page only. Tilting a card a
coder is trying to read is an irritation, not a delight.

---

## 6. Re-theming the imported components

Every component pulled from 21st.dev, rare-ui, beui, beautifului or amicro arrives in **someone
else's palette** — usually dark, usually with pure black, white, and a saturated accent. None of them
may ship as-is.

The sign-in component you have chosen is the clearest case: it is `bg-black` with white text, a cyan
dot matrix, and pill buttons, and it contains `Manifesto / Careers / Discover` nav links, a
`Sign in with Google` button, and MSA / Product Terms / Cookie Notice legal links — none of which
belong in a fourteen-person internal research tool.

**The re-theme checklist, applied to every imported component before it is committed:**

1. Replace every hard-coded color with a token from §1. `bg-black` → `--clobs-paper`; `text-white` →
   `--clobs-ink`; the cyan/white dot matrix → `--clobs-hairline-strong` on `--clobs-paper`.
2. Replace every hard-coded radius with a token from §3. Pilled buttons become
   `--clobs-radius-control` unless they are genuinely pill-shaped elements.
3. Replace every font declaration with `--clobs-font-sans` / `-serif` / `-mono`.
4. Replace every duration and easing with a token from §4. Delete any `transition: all`.
5. Delete all placeholder content — nav links, marketing copy, legal boilerplate, Google sign-in,
   Unsplash images. Nothing that is not real functionality ships.
6. Add the focus ring from §3 to every interactive element. Most imported components have removed it.
7. Add the `prefers-reduced-motion` branch.
8. Check contrast against the cream canvas. Components designed for black backgrounds routinely fail
   on light ones.

A component that has not been through all eight steps is not finished, however good it looked on the
source site.

---

## 7. Do and Don't

### Do

- Keep the paper canvas unbroken across every screen; separate sections with space and hairlines, not
  with background color changes.
- Define every card, table, input and grouped element with `1px solid var(--clobs-hairline)` at
  `--clobs-radius-card`.
- Use Bark for exactly one filled button per view; everything else is outline or ghost.
- Show every score as fill **plus** numeral **plus** label, so the value survives greyscale.
- Set rubric prose in Newsreader at 17px or larger, with generous line height.
- Use mono with tabular figures for every video code, timestamp, duration and numeric table column.
- Use compact density in tables and dashboards, comfortable density in reading and writing surfaces.
- Ship the reduced-motion branch and the focus ring with every component, in the same commit.
- Let the autosave indicator be honest and boring: a small mono timestamp and a state word, no spinner.

### Don't

- Don't put a drop shadow on a card, table, dashboard tile or form section. Hairline and radius only.
- Don't animate anything on the scoring grid or the notes editor. Not a fade, not a slide.
- Don't use a red-to-green scale for the four options. Column A is a finding, not a failure.
- Don't encode school, treatment arm, or teacher assignment as color, icon, order, or any other visual
  signal in a coder-facing surface. It must not be in the payload at all.
- Don't use pure `#000000` or `#ffffff` anywhere.
- Don't use Forest or Lake as a button fill; they are signals.
- Don't use the score ramp for anything that is not a score.
- Don't ship a pilled primary button, a 52px headline, or a hero section inside the application.
- Don't add a second accent color, a gradient on UI chrome, or a glassmorphic panel.
- Don't fire confetti more than twice in an hour of normal work. It stops meaning anything.
- Don't let any imported component keep its original palette, radius, font or legal copy.
- Don't introduce a dark mode in v1.

---

## 8. Accessibility floor — non-negotiable

- WCAG 2.2 AA across the interface. Body text ≥ 4.5:1, large text and UI boundaries ≥ 3:1.
- Full keyboard operation on every screen, in a logical order. The scoring grid must be completable
  without a mouse: arrow keys move between options, number keys 1–4 select, Tab advances to the
  justification field.
- Visible focus everywhere, per §3. Never `outline: none` without an equivalent replacement.
- Every icon-only control carries an accessible label. Every score chip announces its full label.
- Color is never the sole carrier of meaning — scores, statuses, errors and completion all carry text.
- Live regions announce autosave state, sync recovery and calibration presence changes.
- Respect `prefers-reduced-motion` throughout.
- Target size 24×24px minimum; 44×44px for anything used repeatedly.

---

## 9. Quick start

### CSS custom properties

```css
:root {
  /* Surfaces */
  --clobs-paper:            #FBF8F1;
  --clobs-card:             #F5F1E8;
  --clobs-sunken:           #EDE8DC;
  --clobs-hairline:         #DFD8C8;
  --clobs-hairline-strong:  #C9C0AC;

  /* Ink */
  --clobs-ink:              #23201A;
  --clobs-graphite:         #57524A;
  --clobs-smoke:            #6F695E;
  --clobs-ash:              #9A9284;

  /* Action and state */
  --clobs-bark:             #5C4630;
  --clobs-bark-deep:        #48351F;
  --clobs-lake:             #2C5C8F;
  --clobs-lake-wash:        #DCE6F1;
  --clobs-forest:           #3F6B4F;
  --clobs-forest-wash:      #DEEADF;
  --clobs-clay:             #9E3B2E;
  --clobs-clay-wash:        #F6E2DE;

  /* Score ramp — ordinal, warm to cool, from the printed manual */
  --clobs-score-1:          #F2D3B3;
  --clobs-score-1-edge:     #C98B4C;
  --clobs-score-2:          #EDE2D2;
  --clobs-score-2-edge:     #B9A88C;
  --clobs-score-3:          #D3DFEC;
  --clobs-score-3-edge:     #7C9CBF;
  --clobs-score-4:          #A8C6E8;
  --clobs-score-4-edge:     #4A7CB0;

  /* Type */
  --clobs-font-sans:  'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --clobs-font-serif: 'Newsreader', 'Iowan Old Style', Georgia, 'Times New Roman', serif;
  --clobs-font-mono:  'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;

  --clobs-text-micro:      11px;   --clobs-leading-micro:      1.45;
  --clobs-text-caption:    12px;   --clobs-leading-caption:    1.5;
  --clobs-text-body-sm:    14px;   --clobs-leading-body-sm:    1.55;
  --clobs-text-body:       15px;   --clobs-leading-body:       1.6;
  --clobs-text-body-lg:    17px;   --clobs-leading-body-lg:    1.65;
  --clobs-text-prose:      17px;   --clobs-leading-prose:      1.7;
  --clobs-text-prose-lg:   19px;   --clobs-leading-prose-lg:   1.65;
  --clobs-text-heading-sm: 20px;   --clobs-leading-heading-sm: 1.3;   --clobs-tracking-heading-sm: -0.01em;
  --clobs-text-heading:    26px;   --clobs-leading-heading:    1.25;  --clobs-tracking-heading:    -0.015em;
  --clobs-text-display:    36px;   --clobs-leading-display:    1.15;  --clobs-tracking-display:    -0.02em;
  --clobs-text-display-lg: 52px;   --clobs-leading-display-lg: 1.08;  --clobs-tracking-display-lg: -0.025em;

  /* Space */
  --clobs-space-1: 4px;   --clobs-space-2: 8px;   --clobs-space-3: 12px;
  --clobs-space-4: 16px;  --clobs-space-5: 20px;  --clobs-space-6: 24px;
  --clobs-space-8: 32px;  --clobs-space-10: 40px; --clobs-space-12: 48px;
  --clobs-space-16: 64px;

  /* Shape */
  --clobs-radius-card:    16px;
  --clobs-radius-control: 10px;
  --clobs-radius-frame:   12px;
  --clobs-radius-sm:      6px;
  --clobs-radius-pill:    9999px;

  /* Elevation — the only shadow in the system */
  --clobs-shadow-float: 0 1px 2px rgba(35, 32, 26, 0.04),
                        0 8px 24px rgba(35, 32, 26, 0.08);

  /* Motion */
  --clobs-dur-instant: 90ms;
  --clobs-dur-fast:    150ms;
  --clobs-dur-base:    220ms;
  --clobs-dur-page:    280ms;
  --clobs-dur-moment:  420ms;
  --clobs-ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  --clobs-ease-in:     cubic-bezier(0.64, 0, 0.78, 0);
  --clobs-ease-inout:  cubic-bezier(0.65, 0, 0.35, 1);

  /* Layout */
  --clobs-page-max:    1440px;
  --clobs-prose-max:   68ch;
  --clobs-section-gap: 48px;
}

html { background: var(--clobs-paper); color: var(--clobs-ink); }
body { font-family: var(--clobs-font-sans); font-size: var(--clobs-text-body);
       line-height: var(--clobs-leading-body); }

*:focus-visible { outline: 2px solid var(--clobs-lake); outline-offset: 2px; }

.mono, td.num, .timestamp, .video-code {
  font-family: var(--clobs-font-mono);
  font-variant-numeric: tabular-nums;
}
```

### Tailwind v4

```css
@theme {
  --color-paper:            #FBF8F1;
  --color-card:             #F5F1E8;
  --color-sunken:           #EDE8DC;
  --color-hairline:         #DFD8C8;
  --color-hairline-strong:  #C9C0AC;
  --color-ink:              #23201A;
  --color-graphite:         #57524A;
  --color-smoke:            #6F695E;
  --color-ash:              #9A9284;
  --color-bark:             #5C4630;
  --color-bark-deep:        #48351F;
  --color-lake:             #2C5C8F;
  --color-lake-wash:        #DCE6F1;
  --color-forest:           #3F6B4F;
  --color-forest-wash:      #DEEADF;
  --color-clay:             #9E3B2E;
  --color-clay-wash:        #F6E2DE;
  --color-score-1:          #F2D3B3;
  --color-score-2:          #EDE2D2;
  --color-score-3:          #D3DFEC;
  --color-score-4:          #A8C6E8;

  --font-sans:  'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-serif: 'Newsreader', 'Iowan Old Style', Georgia, serif;
  --font-mono:  'JetBrains Mono', ui-monospace, Menlo, monospace;

  --radius-control: 10px;
  --radius-frame:   12px;
  --radius-card:    16px;

  --ease-out:   cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in:    cubic-bezier(0.64, 0, 0.78, 0);
  --ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
}
```

### Example component prompts

1. **Score chip row.** Four chips in a row, 8px gap, each `--clobs-radius-pill`, 12px × 20px padding,
   fill from the score ramp, `--clobs-ink` text at `--clobs-text-body-sm` weight 500, numeral in mono
   followed by the full label in sans. Unselected: 1px `--clobs-hairline`. Selected: 2px in that
   score's edge color, no motion, no scale. Keyboard: 1–4 selects, arrows move.

2. **Rubric pane.** `--clobs-card` fill, `--clobs-radius-card`, 1px `--clobs-hairline`, 24px padding,
   sticky. Concept statement in Newsreader `--clobs-text-display` at 36px. Importance paragraph in
   Newsreader `--clobs-text-prose`, `--clobs-graphite`, max 68ch. Indicators as a bulleted list in
   Inter `--clobs-text-body-sm`. Special Note in a `--clobs-sunken` block at `--clobs-radius-sm` with
   an uppercase 11px `--clobs-smoke` label.

3. **Video queue row.** Compact table, 40px rows, `--clobs-radius-frame` container, header on
   `--clobs-sunken`. Display code in mono `--clobs-text-body-sm`. Subject and duration in sans
   `--clobs-smoke`. Status as a pill: `--clobs-forest-wash` / `--clobs-forest` when complete. Hover:
   `--clobs-card` background at `--clobs-dur-instant`, no transform.

4. **Primary button.** `--clobs-bark` fill, `--clobs-paper` text, `--clobs-radius-control`, 10px × 18px
   padding, Inter 15px weight 600. Hover `--clobs-bark-deep` at 90ms. Active `scale(0.98)` at 90ms.
   Focus ring per §3. One per view.

5. **Autosave indicator.** Inline, right-aligned above the editor. A 6px `--clobs-forest` dot and
   `Saved 14:32` in mono `--clobs-text-caption` `--clobs-smoke`. On pending: `--clobs-ash` dot,
   `Saving…`. On offline: `--clobs-clay` dot, `Offline — saved on this device`. Cross-fade opacity at
   90ms, no movement, no spinner, `aria-live="polite"`.

---

## 10. Provenance

Synthesised from the six style references in `docs/design-references/`, which converge on: warm cream
canvases in the `#f6f3f1`–`#fcf9ee` band, near-monochrome palettes with a single rationed accent,
hierarchy from scale and negative tracking rather than bold weights, hairline borders instead of
shadows, and a 4px base unit at comfortable density.

Two deliberate departures from those references, both because this is a working tool and not a
marketing site: **compact density is admitted alongside comfortable**, and **buttons are not pills**.
One deliberate addition they could not supply: **the ordinal score ramp**, taken from the gradient
already in the printed observation manual so that screen and paper agree.
