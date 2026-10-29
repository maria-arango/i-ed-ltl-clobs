# 09 — Putting the Narratives workspace live (step by step)

> For María. Hosting stays on Vercel + Neon (ADR 0004).

## Where things stand (2026-10-29)

| Step | Status |
|---|---|
| A. Migrations 0011–0013 on the live database | **Done** 2026-10-29 with your approval. Additive only; existing data unchanged; the 4 existing coder accounts were recorded as Scoring team |
| B. Restricted role refreshed | **Done**. Same password, so the live site is unaffected; it cannot read lesson IDs |
| C. The eight Narratives enumerators | **Done**. Accounts created, Narratives team, the PINs you chose (Amendment §56) |
| D. Merge the pull request | **You**: one click (below). Vercel then puts the new site live by itself |
| E. Three settings in Vercel for the nightly Drive copy | **You**: about 5 minutes (below) |
| F. Load the narratives and assign them | **You**, when the final set is chosen |

## D. Merge the pull request

1. Go to <https://github.com/maria-arango/i-ed-ltl-clobs/pulls>.
2. Click the pull request **"Narratives workspace, Scoring section, teams, PIN sign-in, daily Drive copies"**.
3. Wait until the checks at the bottom show a green tick (CI runs the tests, about 3 minutes).
4. Click **Merge pull request**, then **Confirm merge**.
5. About 2 minutes later, open <https://i-ed-ltl-clobs.vercel.app>. You should see the new white
   landing page with **Sign in**.

Admins sign in with an email code at `/signin/email`, or press **New PIN** on your own row on the
Team screen and use email + PIN like everyone else.

## E. Turn on the nightly copy into the Harvard Drive

The copy runs every night at 02:00 Uganda time. It puts two files into the shared-drive folder
`HGSE Nourani Lab Embedded Development Lab › 01-LTL › Classroom-Observation-Coding › 01_Training ›
05_Application › _platform-backups`:

- `clobs-narratives_<date>.zip`: every assigned narrative as Word, plus `MANIFEST.csv`;
- `clobs-narratives-data_<date>.json.gz`: all the narrative data, so any review can be rebuilt.

The connection was tested on 2026-10-29: the test file `clobs-backup-connection-test.txt` in that
folder came from the platform, and you can delete it.

1. Go to <https://vercel.com> → sign in → click the project **i-ed-ltl-clobs** → **Settings**
   (top menu) → **Environment Variables** (left menu).
2. Add three variables. For each one, type the **Key**, paste the **Value**, leave
   **Production** ticked, and click **Save**:

   | Key | Value — where to copy it from |
   |---|---|
   | `CRON_SECRET` | In the editor, open `.env.local`. Copy everything after `CRON_SECRET=` on that line |
   | `DRIVE_BACKUP_FOLDER_ID` | In `.env.local`, everything after `DRIVE_BACKUP_FOLDER_ID=` |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | Open `data/service-account.json` in the editor, select all (Cmd+A), copy (Cmd+C), paste. It starts with `{` and ends with `}` |

3. Make Vercel pick them up: top menu **Deployments** → on the first row click **⋯** →
   **Redeploy** → **Redeploy**.
4. Test it: open the site → **Narratives** → **Copy everything to the Harvard Drive now**.
   - **Success:** "Copied 2 files to the Drive folder…", and the two files appear in the folder.
   - **Most likely error:** "not configured". One of the three keys is misspelled, or the
     redeploy has not finished. Check the keys, wait a minute, and try again.

**Your daily manual copy** (on top of the nightly one): on the dashboard, **Submitted in the last 24
hours (.zip)** downloads what was finished since yesterday. Save it into the same Drive folder.

## F. Load and assign narratives

1. **Narratives** → scroll to **Load narratives** → choose the `NARRATIVE.md` files → **Check** →
   read the table → **Load**.
2. Lesson IDs are always removed (Amendment §57). Right after loading, a yellow box offers
   **Download the code list**. Download it and save it in the Harvard Drive: it is the only record of
   which N-code is which lesson, and it is shown only once.
3. Assign each narrative:
   - **one at a time:** **Assign** on its row (reviewer, order, the Drive link or file id of the video);
   - **all at once:** **Assign from a sheet** with a CSV like `00_assignments.csv`. Put the
     **N-code** (from the code list) in `video_id`, and the reviewer's email or exact full name in
     `reviewer`.
4. To rehearse, load the three placeholder files from `db/seed/narratives/` (invented content) and
   assign one to yourself: tick **Narratives** on your own row on the Team screen first.

## Accounts and PINs later

- **New person:** Team → **Add a teammate** (tick their team) → **Set PIN** → send them the PIN privately.
- **Many people:** save a sheet with `Name, Email, Team, 4-digit code` as CSV in `data/` and run
  `node scripts/import-enumerators.mts data/<file>.csv` (preview), then the same with `--apply`.
- **Forgotten PIN or a locked account:** Team → **New PIN** (or **Unlock + new PIN**).
- Anyone can change their own PIN under **Change PIN** at the top of the page.

## Downloads

- **One narrative:** **Word** on its row. A submitted narrative downloads exactly as submitted.
- **Everything submitted:** **Download submitted (.zip)**, with `MANIFEST.csv`.
