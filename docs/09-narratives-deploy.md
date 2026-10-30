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
| F. Load the narratives and assign them | **You**, when the final set is chosen (step-by-step below; Amendment §61) |

## D. Merge the pull request

1. Go to <https://github.com/maria-arango/i-ed-ltl-clobs/pulls>.
2. Click the pull request **"Narratives workspace, Scoring section, teams, PIN sign-in, daily Drive copies"**.
3. Wait until the checks at the bottom show a green tick (CI runs the tests, about 3 minutes).
4. Click **Merge pull request**, then **Confirm merge**.
5. About 2 minutes later, open <https://i-ed-ltl-clobs.vercel.app>. You should see the new white
   landing page with **Sign in**.

Admins type their email on the sign-in page and receive the 6-digit code by email, as before.

## E. Turn on the nightly copy into the Harvard Drive

The copy runs every night at 02:00 Uganda time. It puts two files into the shared-drive folder
`HGSE Nourani Lab Embedded Development Lab › 01-LTL › Classroom-Observation-Coding › 01_Training ›
05_Application › _platform-backups`:

- `clobs-narratives_<date>.zip`: every assigned narrative as Word, plus `MANIFEST.csv`;
- `clobs-narratives-data_<date>.json.gz`: all the narrative data, so any review can be rebuilt.

The same setting also lets the platform check, read-only, that each narrative's video link is
the right file (section F). The connection was tested on 2026-10-29: the test file `clobs-backup-connection-test.txt` in that
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

## F. Load and assign narratives (Amendment §61)

### What you upload

- **The review script Word files**, one per lesson, exactly as `review_script.py` makes them
  (`01_<tr_id>_SCRIPT_<name>.docx`, like the ones in `20261021_reviewing_narratives/<reviewer>/
  review_scripts_v2`). Not PDFs, not HTML. The platform shows them with the same layout: time,
  speaker, text; bold scene lines; grey italic "seen" lines; the context card on top.
- The older `NARRATIVE.md` files still work too.
- The platform reads each lesson's ID (**tr_id**) from the file's own title ("Review script —
  `<tr_id>`"), never from the file name, and works out the school (**sid**) from it.

### 1. Load the scripts

1. Open the site → **Narratives** (left menu) → scroll to **Load narratives**.
2. Click **Choose Files** and select the script Word files (you can select many at once).
3. Leave **Practice** unticked (see step 4 for practice).
4. Click **Check N files**. A table lists each file with its **Lesson (tr_id)**, length and number
   of lines. "New" means it can be loaded; "Already loaded" means it is there already.
5. Click **Load N narratives**. They appear under **By narrative**, each with its tr_id and school.

### 2. Assign them with a sheet

Save a sheet as **CSV** with these columns (your `00_assignments.csv` works as it is; other
columns are ignored):

| Column | Example | What it does |
|---|---|---|
| `order` | `1` | The enumerator sees it as **Video 1**. Each number once per enumerator |
| `reviewer` | `Aggrey` or their email | Who gets it (exact full name or email) |
| `video_id` | `<tr_id>` | Which narrative: the lesson's tr_id |
| `video_file` | `<sid>_<tr_id>_11_EAST_BIOLOGY_comp.mp4` | The video's file name in Drive |
| `video_drive_id` | the Drive file id | Becomes the enumerator's **Open video** link |

1. **Narratives** → **Assign from a sheet** → **Choose File** → your CSV → **Check sheet**.
2. Read the table. For every row the platform checks that **the video belongs to the lesson**:
   - it asks Google Drive for the linked file's real name and checks it starts with
     `<sid>_<tr_id>_` of that narrative;
   - it checks `video_file` the same way.

   **✓ Checked in Drive** (or **✓ Matches the sheet**) and **Ready** mean the row is right. A red
   reason ("the linked Drive file is … which is not lesson …", "this reviewer already has a
   Video 1") means that row will **not** be assigned: fix the sheet and check again.
3. Click **Assign N narratives**.

The Drive check needs `GOOGLE_SERVICE_ACCOUNT_JSON` in Vercel (step E). Until then the platform
checks `video_file` only.

### 3. Assign one at a time (instead of a sheet)

On a row under **By narrative**, click **Assign** → choose the reviewer (the order fills in with
their next free number) → paste the Drive link or file id → **Assign**. The same video check runs;
a wrong video is refused with the reason.

### 4. A practice narrative (to see what enumerators see)

1. **Team** → your own row → tick **Narratives** (optional: an admin with a narrative assigned
   sees **My narratives** anyway).
2. **Narratives** → **Load narratives** → choose one script → tick **Practice** → **Check** →
   **Load 1 practice narrative**.
3. Under **Practice narratives**, click **Assign** → choose yourself → paste its video link →
   **Assign**.
4. Left menu → **My narratives** → **Practice**. Edit it exactly as an enumerator would. Practice
   narratives never count in progress, downloads or the nightly copy.

### What enumerators see, and what only admins see

| | Enumerators | Admins |
|---|---|---|
| Name of each narrative | **Video 1, Video 2…** (Practice first) | tr_id, school (sid), "shows as Video N" |
| The narrative's own title | "Review script — `<tr_id>`" (kept on purpose, to check the video) | same |
| Video | **Open video in a new tab** | the link, the checked file name and how it was checked |
| Word downloads, MANIFEST.csv, nightly copy | — | sid, tr_id, video_file, video link, check |

### Downloads

- A script downloads as `01_<tr_id>_SCRIPT_<FirstName>.docx` in the original script layout, with
  the enumerator's red text, strikethroughs and Word comments, and a "Reviewed on the platform by
  …" line under the subtitle. `review_import.py` reads it like a script corrected in Word.

## Accounts and codes

- **Signing in:** type your email. Admins, and anyone without a 4-digit code (for example a
  Scoring-team or Gmail coder account), then receive the 6-digit code by email, as before. People
  with an assigned 4-digit code are asked for it.
- **New person:** Team → **Add a teammate** (tick their team) → **Set code** → type the 4-digit
  code the master team assigned → **Save**.
- **Many people:** save a sheet with `Name, Email, Team, 4-digit code` as CSV in `data/` and run
  `node scripts/import-enumerators.mts data/<file>.csv` (preview), then the same with `--apply`.
- **Locked after too many wrong tries:** Team → **Unlock** on their row. Their code stays the same.
- **A code needs correcting:** Team → **Change code** → type the right code → **Save**.
- Enumerators cannot change their own code; the master team's codes stay the same everywhere.

## Downloads (all narratives)

- **One narrative:** **Word** on its row. A submitted narrative downloads exactly as submitted.
- **Everything submitted:** **Download submitted (.zip)**, with `MANIFEST.csv` (sid, tr_id, video
  file and link for every file).
