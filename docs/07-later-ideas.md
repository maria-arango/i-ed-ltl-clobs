# 07 — Later ideas (nice-to-haves parked until the main stages are done)

A running list of improvements María has proposed that we agreed to record now and build
after the core stages (calibration room, gold/certification, dashboards, exports, backup)
are complete. Add new ideas at the bottom with the date. When one is built, move it to the
handoff's progress log instead of deleting it here.

Rule of thumb for what lands here: anything that does not affect research validity,
blinding, or the October 30 deadline.

## Parked on 2026-08-31

### 1. Study calendar with weekly targets

A calendar (likely on the admin home or a `/admin/plan` screen) showing the study weeks
between now and October 30, and for each week: who is expected to be working (from the
availability model that already exists), the expected number of completed videos by the end
of that week, and the actual count as the week progresses. Admin can adjust expectations
per week ("Week 1: 6 people, 90 videos").

- **Feasibility:** high. The availability table already stores who works when and at what
  rate, so expected counts can be computed rather than typed; a `week_targets` table would
  hold manual overrides. Actuals come from submitted observations.
- **Fits best:** Stage 4 (dashboards), since it shares the same progress queries.

### 2. In-app chat between coders and admins

A space where coders and admins can ask questions and arrange calibration meetings, styled
like the 21st.dev WhatsApp-mock component
(https://21st.dev/@rayimanoj8/components/chat-template/whatsapp-mock).

- **Feasibility:** doable, with care. The UI is easy; the real work is the realtime layer
  (polling is fine at this team size) and one hard rule: chat must never leak blinded
  information, so messages should reference videos only by display code and the chat tables
  must be readable by the restricted coder role only where intended. Free-text is a
  blinding risk we cannot automatically police — coders could type school names — which is
  the same risk Slack has today, so this is a convenience question, not a validity one.
- **Recommendation:** keep the lab Slack through the study; consider a lightweight
  "calibration scheduling" thread per pair (structured, not free chat) as part of the
  calibration room later. Note: 21st.dev free tier allows 2 component retrievals/month and
  this month's are used; María can hand-copy the component code as before.

### 3. "Who is online" avatar group

Show currently signed-in team members as an overlapping avatar row with hover cards
(https://transitions.dev/detail.html?t=avatar-group-hover), e.g. in the sidebar or on the
Team screen.

- **Feasibility:** high. A `last_seen_at` timestamp updated by a lightweight heartbeat
  (every ~2 minutes while the app is open) and "online = seen in the last 5 minutes" is
  enough; no realtime infrastructure needed. Pairs nicely with the calibration room
  ("your partner is online now").
- **Fits best:** alongside or right after the calibration room, since co-presence is
  already being tracked there.

### 4. Email notification when a wave lands

When an admin confirms a wave, email each coder their new videos and who
their partner is (Resend is already configured for sign-in codes). In-app,
both facts are already visible (My videos shows the partner; Calibration
shows the pair per video) — the email is a nudge, not the source of truth.

- **Feasibility:** high; ~30 lines in the confirm path plus a template.
- **Fits best:** after the chat/scheduling decision, so the email can point
  wherever coordination ends up happening.

### 5. Sign-in page cursor effect

On the sign-in page, a cursor-tracked effect where the dotted background highlights around
the pointer as it moves (in the spirit of https://21st.dev/?q=follow+mouse — "follow mouse"
components).

- **Feasibility:** high and cheap — the sign-in page already renders the dotted surface,
  so this is a small canvas/JS enhancement. Must respect `prefers-reduced-motion`
  (DESIGN_SYSTEM: all motion behind the media query) and stay pointer-only (no effect on
  touch devices). Sign-in is a Boundary surface where playfulness is allowed.
- **Fits best:** Stage 5 polish, together with the rest of the sign-in page's character.

## Motion & component adoption map (2026-08-31, "alive" pass)

Where María's referenced libraries/skills landed. IN = live on the platform.

| Reference | Status | Where |
|---|---|---|
| beui file-tree "gliding selection" | IN (technique) | Sidebar: hover glide (GlideMenu) + active pill that glides between items (motion layoutId) |
| beautifului sidebar-nav / animate-ui sidebar | IN (spirit) | Same sidebar; the animate-ui sidebar file was removed — its registry install was missing three dependencies and could not compile |
| animate-ui checkbox | IN | Week plan roster ("Who codes this week") |
| beautifului filter-table | IN (pattern) | My videos (status chips + search) and admin Progress table |
| beautifului insight-cards | IN (pattern) | Progress dashboard stat cards |
| transitions notification-badge | IN | Sidebar badges: new videos, calibrations ready |
| transitions success-check + confetti-burst | IN | Calibration completed (live in the room only); observation submit already had confetti |
| transitions page-side-by-side | IN | Route transitions (content pane slide) |
| transitions tabs-sliding | IN (already) | Workspace tabs indicator |
| transitions spinning-counter / beui number | IN | NumberTicker: home stats, video library coverage, Progress cards |
| transitions 3d-tilt | IN | Sign-in photograph panel (pointer-only, reduced-motion safe) |
| transitions learn-more-hover | IN | Video link card (lift + arrow slide) |
| transitions shimmer-text / text-states-swap / matrix-dot-loader | IN (one of them) | Route loading uses shimmering skeletons; the other loader styles stay options |
| transitions avatar-group-hover | PARTIAL | Calibration room presence bubbles; "who's online" everywhere needs the heartbeat (idea #3 above) |
| transitions tooltip-open-close | PARKED | No tooltip surface yet worth a system; candidates: toolbar buttons, dashboard terms |
| transitions texts-reveal | PARKED | Deliberately not on Operate surfaces; candidate: sign-in greeting |
| beui dock | PARKED | Optional app-level dock; revisit after Stage 4 |
| beui file-tree (as a browser) | PARKED | Could browse the video library by school prefix (admin-only) in Stage 4+ |
| rareui fluid-orb | IN (since scaffold) | Sign-in canvas |
| beautifului records-table | REFERENCE | Full pattern kept in `.reference/beautifului/` for the Stage 4 export/records screens |

## Taste-skill audit note (2026-09-01)

Ran impeccable, emil-design-eng and design-taste-frontend over the platform.
Applied (all additive): badge pop-in starts at scale 0.6 not 0 (nothing real
appears from nothing), hover lift gated behind (hover:hover)+(pointer:fine),
skeleton loaders shimmer with a light sweep (reduced-motion falls back to
pulse), scrollbars themed to the palette (the cheapest built-not-assembled
signal). Verified: contrast (smoke ≥4.8:1 on its real surfaces), focus rings,
selection/caret theming, active-press scale on buttons, easing tokens.
Rejected with reasons: design-taste-frontend's premium-consumer palette ban
and serif discipline (our cream/brown + Newsreader is the APPROVED brand —
the brief wins), impeccable's kicker/eyebrow ban (María approved the kicker
style; numbered step labels carry real sequence), and every suggestion that
would reduce motion (per María's standing instruction).
