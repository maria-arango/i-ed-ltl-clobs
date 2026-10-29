# 09 — Putting the Narratives workspace live (step by step)

> For María. Written 2026-10-29 with the `feat/narratives-workspace` branch. Nothing here has
> been done yet: each step that touches the live site or the live database needs your go-ahead.
> Hosting stays on Vercel + Neon (ADR 0004).

## The order matters

The new code expects three new database changes (migrations `0011`, `0012`, `0013`). They only
**add** things, so the current site keeps working with them in place. Run them **before** the
new code goes live. If the code goes live first, every page fails until they are run.

1. Run the three migrations on the live database (step A).
2. Refresh the restricted database role's permissions (step B).
3. Merge the pull request. Vercel then puts the new code live by itself, in about 2 minutes.
4. Add the Narratives team and give everyone a PIN (steps C–D).
5. Load the narratives and assign them (step E).

## A. Run the migrations (about 1 minute)

**What it does:** creates the team, narrative and PIN tables, adds a start time to sign-in
sessions, and records every existing coder as a Scoring-team member so nobody loses access. It
deletes and changes nothing that exists.

1. In the editor, open the terminal: **Terminal → New Terminal**.
2. Make sure you are on the right branch. Type `git status` and press Enter. The first line must say
   `On branch feat/narratives-workspace`.
3. Type exactly:

   ```
   npx drizzle-kit migrate
   ```

   - **Success:** the last line says `migrations applied successfully!`
   - **Most likely error:** `password authentication failed`. Your `.env.local` is missing or out
     of date. Do not retry; tell me.

## B. Refresh the restricted role (about 10 seconds)

**What it does:** lets the enumerator-facing part of the site read and save narratives, without
ever seeing lesson IDs. It keeps the role's current password, so the live site is not affected.

```
node scripts/setup-coder-role.mts
```

**Success:** `Granted on 34 tables (and nothing else).`

## C. Add the Narratives team

**Option 1, the Team screen** (any number of people):

1. Go to the site → **Team** in the left menu (or the top bar, from the Narratives area).
2. In **Add a teammate**, enter the email and full name, tick **Narratives** under Teams, and
   press **Add teammate**.
3. For people who are already listed, click **Narratives** in their **Teams** column. It turns blue.

**Option 2, from your roster spreadsheet** (fastest for many people):

1. Open `Enumerator_Teams_Oct2026.xlsx` → **File → Save As** → format **CSV UTF-8** → save it
   inside the project's `data` folder as `enumerator-teams.csv`. The `data` folder is never
   uploaded to GitHub.
2. Preview (writes nothing; it shows only counts):

   ```
   node scripts/import-enumerators.mts data/enumerator-teams.csv
   ```

3. If the counts look right, write:

   ```
   node scripts/import-enumerators.mts data/enumerator-teams.csv --apply
   ```

   - "Rubric" becomes Scoring, "Context Card" becomes Context cards, and "Narratives" becomes
     Narratives.
   - "Reserve" and "Out" rows are skipped.
   - Running it twice changes nothing the second time.

## D. Give each person a PIN

1. **Team** → each person's row → **Set PIN**.
2. A 4-digit PIN appears **once**. Send it to that person privately (a direct message, not a
   group). Then press **Done**.
3. They sign in at the site's address with **their email + that PIN**. They can change it under
   **Change PIN** at the top of the page.
4. **Forgotten PIN or a locked account** (5 wrong tries lock it for 15 minutes; 10 lock it until
   you act): press **New PIN** (or **Unlock + new PIN**) and send the new one.
5. You and other admins can keep signing in with the email code at `/signin/email`, or set your
   own PIN the same way.

## E. Load and assign narratives

1. Top bar → **Narratives** → scroll to **Load narratives**.
2. Choose the `NARRATIVE.md` files.
   - Leave **Remove lesson IDs** ticked if the platform should store no lesson IDs (decision D2).
     Each narrative is then known only by its code (N-0001…), so keep your own note of which code
     is which lesson. The Word download's file name then uses the code too.
3. Press **Check**, read the table, then press **Load**.
4. Assign each narrative:
   - **one at a time:** **Assign** on the narrative's row (reviewer, order, video link or Drive id);
   - **all at once:** **Assign from a sheet** with a CSV like `00_assignments.csv`
     (`order, reviewer, video_id, video_drive_id`). Use the email or the exact full name in
     `reviewer`, and the N-code in `video_id` if lesson IDs were removed.
5. To test first, load the three placeholder files from `db/seed/narratives/` (invented content),
   assign one to yourself (tick Narratives on your own Team row), and try it.

## Downloads

- **One narrative:** **Word** on its row, or **Download Word** on its page. A submitted narrative
  downloads exactly as submitted.
- **Everything submitted:** **Download submitted (.zip)**. It includes `MANIFEST.csv` (who, when,
  version, edit counts, and a checksum of each file).

## Recommended follow-up (not built)

A nightly copy of the database and of the submitted Word files into the Harvard Google Drive.
That way a copy always sits on Harvard storage, not only at Neon. About 1 day of work, using the
Google service account that already exists.
