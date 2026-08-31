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
