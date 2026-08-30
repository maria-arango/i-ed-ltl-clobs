# 02 — Build plan: the five stages mapped onto the week

- **Status:** account setup (steps 1–5 below) **completed by María 2026-08-30**: Vercel, Neon, domain
  `ltl-classroom-observations.org` verified on Resend, service account
  `clobs-backup@ltl-clobs-backup.iam.gserviceaccount.com` with editor access to `_platform-backups/`,
  21st.dev key. Keys live in `.env.local` (gitignored, verified). Decisions of 2026-08-30 are in
  `01-addendum.md` Amendment B. Hard deadline context: coding + calibration complete by **2026-10-30**.
- **Inputs:** ADR 0001 (accepted), `docs/00-brief.md`, `docs/01-addendum.md` incl. §17 Amendment A,
  `DESIGN_SYSTEM.md`, the redacted samples in `docs/source-materials/`, `docs/rubric/20260822_CLOBS.tex`

ADR 0001 fixes five build stages. This document maps them onto seven working days, says what exists and
works at the end of each day, and lists every external account you must create — with exact steps — and
flags the two items that have a real delay attached.

**The cut rule from ADR 0001 applies throughout: anything cut for time is cut from the end (Stage 5
polish first, then Stage 4 dashboards), never from the middle.**

---

## The week at a glance

| Day | Stage | What exists and works at the end of the day |
|-----|-------|---------------------------------------------|
| 1 | Scaffold | Next.js app at the repo root, design tokens wired, `/styleguide` route you can inspect, imported components re-themed. CI runs lint + typecheck + tests on every PR. |
| 2 | Stage 1 — Foundation | Database schema migrated (with `dataset` in the first migration), email one-time-code sign-in works, roles enforced, admin can import the video list and every video has an opaque display code. Blinding test suite exists and passes. |
| 3–4 | Stage 2 — The coding path | A coder can code a video end to end: open their queue, follow the Drive link, fill the context card (if it's their duty), take timestamped notes, score all eight items with the rubric alongside, cite notes from justifications, autosave throughout, mark sections complete. |
| 5 | Stage 3 — Assignment & calibration | Seeded, balanced, reproducible video assignment (incl. randomised context-card duty per Amendment A). Calibration room that opens only when both coders are present; individual scores lock on submission; consensus + sign-off recorded. |
| 6 | Stage 4 — Admin & export | Admin dashboard (progress, reliability statistics), the seven-table export in CSV + Stata `.dta` with codebook, nightly backup into Google Drive, restore procedure documented **and tested once**. |
| 7 | Stage 5 — Polish + buffer | Page transitions, completion moments (confetti, twice-an-hour cap), embedded theatre-mode playback if the Drive embed verification passed, encouragement messages, accessibility pass, and slack for anything that slipped. |

Two things run through every day, not at the end: the blinding tests (a rule is not done until its
API-layer test passes) and the re-theme checklist (an imported component is not done until all eight
steps in `DESIGN_SYSTEM.md` §6 are done).

### What each stage produces, in your terms

- **End of Day 2** you can sign in as yourself (admin) and as a fake coder, and prove the fake coder's
  API cannot see school, arm, or raw video IDs.
- **End of Day 4** a coder could start real work — this is the "coders working in three weeks on
  something plain" bar from the addendum, hit early.
- **End of Day 5** the study's methodology is protected: balanced seeded assignment, locked individual
  scores, enforced co-presence.
- **End of Day 6** you can download the dataset and the nightly backup is landing in Drive.
- **End of Day 7** it feels like the product in DESIGN_SYSTEM.md.

Gold-set certification and drift re-checks (addendum §9) are scheduled inside Stage 3–4 as schema +
admin entry + the certification gate; the reliability statistics land with the Stage 4 dashboard. If Day
5 runs long, the certification *gate* (blocking assignment until passed) is the first thing deferred —
the *data model* for it ships on Day 2 regardless, so deferring the gate needs no migration.

---

## External accounts to create — do these on Day 1, in this order

Two items have real lead time and are marked ⚠️. Everything else is instant.

### 1. Vercel (hosting) — instant, free

1. Open **https://vercel.com/signup**.
2. You'll see "Sign Up" with several buttons — click **Continue with GitHub** and authorize it. Choose
   the **Hobby** plan when asked.
3. Nothing to copy yet. When the app exists I'll give you the exact "Import Project" clicks; connecting
   the repo is how deploys happen from then on.
4. Nothing to run. Success = you land on a page titled "Overview" with your GitHub avatar top-right.

### 2. Neon (the PostgreSQL database) — instant, free

1. Open **https://neon.tech** and click **Sign up**, then **Continue with GitHub**.
2. You arrive at "Create your first project". Name it `i-ed-ltl-clobs`, region: leave the default US
   East (this is fine — see the compliance note below), Postgres version: leave the default.
3. After it creates, you'll see a panel titled **Connection string** with a long line starting
   `postgresql://…`. Click the copy icon next to it. Paste it into the file **`.env.local`** at the repo
   root (I will have created this file with a placeholder line `DATABASE_URL=` — paste directly after
   the `=`, no quotes, no spaces). Never paste it anywhere else, never into chat, never into a file that
   isn't `.env.local`.
4. Nothing to run yet; the Day 2 migration command will verify it. Success there = `drizzle-kit migrate`
   prints the migration names with no red text. The most likely error is `password authentication failed`,
   which means the string was truncated when copying — re-copy the whole line from Neon.

### 3. ⚠️ Transactional email for sign-in codes — the one item that costs money and has a delay

Sign-in works by emailing a one-time code (ADR 0001). To send email to 14 arbitrary work addresses, the
sending service must verify a **domain you control**. Harvard's domain is not available to us, so:

- **Recommendation:** buy a cheap domain (about **US$10–12/year** — this is the only money the project
  spends) and use **Resend** (free tier: 3,000 emails/month, far more than we need).
- **⚠️ Delay:** DNS records usually verify in minutes but can take up to 24–48 h. Do this first on Day 1
  so it's ready when auth is built on Day 2.
- **Fallback that costs nothing:** codes can be sent from a Gmail account via SMTP (fine at 14 users,
  worse deliverability and a daily cap). Local development never needs email at all — codes print to the
  terminal. So this never blocks the build, only the moment real coders first sign in.

Steps, if you approve the purchase (say so before I proceed — this spends money):

1. Open **https://domains.cloudflare.com**, create a free Cloudflare account (email + password), search
   for a name like `ltlclobs.org` and buy it (~$10/yr, at-cost pricing, auto-renew on by default).
2. Open **https://resend.com**, click **Sign up**, use GitHub. In the left sidebar click **Domains** →
   **Add Domain**, type the domain you bought. Resend shows a table of 3–4 DNS records.
3. In another tab, Cloudflare dashboard → your domain → **DNS** → **Records** → **Add record** for each
   row Resend shows (copy Type, Name, Content exactly). Back in Resend, click **Verify DNS Records**.
   Success = every row turns green with "Verified". If rows stay "Pending" for more than an hour,
   the usual cause is a typo'd Name field — re-compare character by character.
4. In Resend, left sidebar → **API Keys** → **Create API Key**, name it `clobs-prod`, permission
   "Sending access". Copy the key that appears (it is shown once) and paste it into `.env.local` on the
   line `RESEND_API_KEY=`.

### 4. Google Cloud service account (nightly backup into Drive) — instant to create, ⚠️ may wait on a person

Needed for Stage 4 (Day 6), not before — but start it Day 1 because step 5 depends on another person.

1. Open **https://console.cloud.google.com** and sign in with the Google account that can see the
   project Drive. If asked to agree to terms, do. Top bar → project picker → **New Project**, name
   `ltl-clobs-backup`, Create. (Free — no billing account needed for this.)
2. Left menu (☰) → **APIs & Services** → **Library**, search **Google Drive API**, click it, click
   **Enable**.
3. ☰ → **IAM & Admin** → **Service Accounts** → **Create service account**. Name `clobs-backup`,
   click Create and continue, skip the optional role screens, Done.
4. Click the account you just made → **Keys** tab → **Add key** → **Create new key** → **JSON** →
   Create. A `.json` file downloads. Move it to `data/service-account.json` (that path is gitignored —
   verify with `git status`, it must NOT appear). Never commit it, never paste its contents anywhere.
5. ⚠️ On the service account page, copy the **email** shown (ends in `.iam.gserviceaccount.com`). In
   Google Drive, right-click the folder `…/Classroom-Observations/_platform-backups/` (create it first)
   → **Share** → paste that email → role **Editor**. **If the folder lives in a Shared Drive you don't
   administer, the Shared Drive admin must add it — identify that person on Day 1** (this is also
   addendum §16 question 8).

### 5. 21st.dev API key (for the sign-in components in scaffold step 3) — instant, free

1. Open **https://21st.dev** and sign up (GitHub button).
2. Click your avatar (top right) → **Settings** → **API Keys** (labelled "Magic API key" on some
   pages) → **Create key** and copy it.
3. Paste it into `.env.local` on the line `API_KEY_21ST=`. It is only used at install time on Day 1,
   never at runtime, and never deployed.

### Nothing to create for

- **GitHub** — the repo already exists. CI (GitHub Actions) and the nightly backup schedule are files
  in the repo, not accounts.
- **npm packages** (`canvas-confetti`, shadcn components from public registries) — no login, no key.
  I'll say before each install on Day 1 whether it needs anything, per your instructions.

---

## Verifications owed before promises (addendum §10)

On Day 1, alongside the accounts, I will verify and report rather than assume:

1. **Drive `/preview` embed** — whether the iframe embed still works in current Chrome with third-party
   cookie restrictions, for a signed-in viewer. The design degrades to "open in Drive in a new tab"
   either way; theatre mode is an enhancement (built Day 7), never a dependency.
2. **Drive file names** — whether the video files' names leak the raw ID (`10102_9…`) into the embed or
   link preview. If they do, the coder UI labels everything by display code and we ask whether renaming
   in Drive is acceptable; if not, links open in a new tab where the coder is already inside Drive
   (which they need access to anyway — the file name leak is then a Drive-side fact to decide on, and I
   will report it explicitly rather than paper over it).
3. **The mapping sheet** — I will assume you supply `00_selected_teachers_rand.dta` into `data/raw/`
   (per `data/README.md`) as the assignment source; Drive API file-ID listing is the enhancement.

## Compliance note (addendum §1, one paragraph, written for a reviewer)

Per ADR 0001, the study team has determined that recordings are Level 3 and never leave Google Drive;
the platform stores no video, frame, or derivative. What the platform's database (Neon, managed
PostgreSQL, AWS US-East region, encrypted at rest and in TLS transit) holds — notes, scores,
justifications, context cards, accounts, audit log — is classified by the study team as not Level 3.
Neon staff could technically access the database as any managed vendor could; Vercel hosts only the
application code and sees data in transit within the app. The video→school→arm mapping is confidential
for research (blinding) reasons and is protected by access control and automated tests, not by hosting.
Nightly backups are written to the project's institutional Google Drive. If any of this classification
changes, the Dockerfile (maintained from Day 1) makes a move to Harvard-contracted hosting a pg_dump,
a redeploy, and a DNS change.
