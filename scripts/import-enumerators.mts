/**
 * Create accounts and team memberships from the enumerator roster
 * (e.g. Enumerator_Teams_Oct2026.xlsx saved as CSV under data/, which is
 * gitignored — the roster holds personal emails and never enters git).
 *
 *   node scripts/import-enumerators.mts data/enumerator-teams.csv          # preview only
 *   node scripts/import-enumerators.mts data/enumerator-teams.csv --apply  # write
 *
 * Columns (header row anywhere in the first lines): Name, Email, Team.
 * Team values: "Rubric" → scoring, "Context Card" → context_cards,
 * "Narratives" → narratives. "Reserve" and "Out" rows are SKIPPED: no
 * account is created (an account with no team would keep the pre-teams
 * scoring access); add them on the Team screen when they join a team.
 * Existing accounts are never changed except to ADD a missing team.
 * Prints counts only — no names or emails.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Pool } from "pg";
import { hardenSslMode } from "../lib/pg-url.ts";

config({ path: ".env.local" });

const [file, flag] = process.argv.slice(2);
const apply = flag === "--apply";
if (!file) {
  console.error("Usage: node scripts/import-enumerators.mts <csv> [--apply]");
  process.exit(1);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim()));
}

const TEAM: Record<string, string | null> = {
  rubric: "scoring",
  scoring: "scoring",
  "context card": "context_cards",
  "context cards": "context_cards",
  narratives: "narratives",
  reserve: null,
  out: null,
};

const rows = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
const headerAt = rows.findIndex((r) => r.some((c) => /^email$/i.test(c.trim())));
if (headerAt < 0) {
  console.error("No header row with an 'Email' column found.");
  process.exit(1);
}
const header = rows[headerAt].map((h) => h.trim().toLowerCase());
const col = (name: string) => header.indexOf(name);
const people = rows
  .slice(headerAt + 1)
  .map((r) => ({
    name: (r[col("name")] ?? "").trim(),
    email: (r[col("email")] ?? "").trim().toLowerCase(),
    teamRaw: (r[col("team")] ?? "").trim().toLowerCase(),
  }))
  .filter((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));

const unknownTeams = people.filter((p) => !(p.teamRaw in TEAM));
if (unknownTeams.length) {
  console.error(`${unknownTeams.length} row(s) have an unrecognised Team value; fix the sheet first.`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const target = /neon\.tech/.test(url) ? "the LIVE Neon database" : "a local database";
console.log(`${people.length} people in the sheet. Target: ${target}. Mode: ${apply ? "APPLY" : "preview (nothing written)"}`);

const pool = new Pool({ connectionString: hardenSslMode(url), max: 1 });
const c = await pool.connect();
let created = 0;
let teamAdded = 0;
let unchanged = 0;
let skipped = 0;
try {
  if (apply) await c.query("BEGIN");
  for (const p of people) {
    const team = TEAM[p.teamRaw];
    const found = await c.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [p.email]);
    let id = found.rows[0]?.id;
    if (!team && !id) {
      skipped++;
      continue;
    }
    if (!id) {
      created++;
      if (apply) {
        const ins = await c.query<{ id: string }>(
          "INSERT INTO users (email, name, role, dataset_scope) VALUES ($1, $2, 'coder', 'live') RETURNING id",
          [p.email, p.name || null],
        );
        id = ins.rows[0].id;
        await c.query(
          "INSERT INTO audit_log (action, subject_table, subject_id, details) VALUES ('team_member_added', 'users', $1, $2)",
          [p.email, JSON.stringify({ via: "scripts/import-enumerators.mts", team })],
        );
      }
    }
    if (!team) {
      unchanged++;
      continue;
    }
    const has = id
      ? await c.query("SELECT 1 FROM user_teams WHERE user_id = $1 AND team = $2 AND removed_at IS NULL", [id, team])
      : { rowCount: 0 };
    if (has.rowCount === 0) {
      teamAdded++;
      if (apply && id) await c.query("INSERT INTO user_teams (user_id, team) VALUES ($1, $2)", [id, team]);
    } else unchanged++;
  }
  if (apply) await c.query("COMMIT");
} catch (e) {
  if (apply) await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
console.log(
  `New accounts: ${created}. Team memberships to add: ${teamAdded}. Already in place: ${unchanged}. Skipped (Reserve/Out, no account): ${skipped}.`,
);
if (!apply) console.log("Preview only. Re-run with --apply to write.");
else console.log("Done. Next: set each person's PIN on the Team screen.");
