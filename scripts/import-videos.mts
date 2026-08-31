/**
 * Import the video list into `videos` + `video_provenance` (admin-side only;
 * docs/03-data-model.md §4.2, Amendment B §6 and §11).
 *
 * Input: a CSV with ONE ROW PER VIDEO and header
 *   filename,sid,tr_id,arm,assignment,subject
 * produced by scripts/prepare-video-list.py from the .dta mapping file.
 * The CSV lives under data/ and is never committed.
 *
 * What it does, in one transaction:
 * - applies the exclusion rules (Amendment B §11): tr_id containing "-666"
 *   or "NO_TEACHER", and language subjects (Kiswahili incl. Lugha/Faishi
 *   variants, Lusoga, Luganda, French, Arabic) — excluded rows are kept in
 *   provenance with a reason and their video row is status "void";
 * - mints opaque display codes V-0001… in an order shuffled by the given
 *   seed, so codes reveal nothing about school or import order;
 * - records the import (seed included) in the audit log, so the
 *   randomisation is reproducible and reportable.
 *
 * Usage:
 *   npm run videos:import -- --csv data/raw/video_list.csv --seed clobs-2026 [--dataset live] [--batch main-2026] [--dry-run]
 *
 * Refuses to run twice for the same dataset (no accidental double import).
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.ts";

config({ path: ".env.local" });

/* ---------------------------- arguments ---------------------------- */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && !process.argv[i + 1]?.startsWith("--")
    ? process.argv[i + 1]
    : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const csvPath = arg("csv") ?? "data/raw/video_list.csv";
const seed = arg("seed");
const dataset = (arg("dataset") ?? "live") as "live" | "test" | "training";
const batch = arg("batch") ?? null;
const dryRun = has("dry-run");

if (!seed) {
  console.error(
    "A --seed is required so the display-code shuffle is reproducible.",
  );
  process.exit(1);
}

/* ------------------------------ CSV -------------------------------- */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/* ------------------------- seeded shuffle -------------------------- */

// Deterministic PRNG from a string seed (mulberry32 over a string hash).
function seededRandom(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* --------------------------- exclusions ---------------------------- */

const LANGUAGE_SUBJECT =
  /KISWAHILI|LUSOGA|LUGANDA|FRENCH|ARABIC/i; // incl. LUGHA/FAISHI(A) variants via KISWAHILI

function exclusionReason(trId: string, subject: string): string | null {
  if (/-666|NO_TEACHER/i.test(trId)) return `tr_id flag: ${trId}`;
  if (LANGUAGE_SUBJECT.test(subject)) return `language subject: ${subject}`;
  return null;
}

/* ------------------------------ main ------------------------------- */

const ARM_MAP: Record<string, "control" | "dispersed" | "connected"> = {
  control: "control",
  "pure control": "control",
  dispersed: "dispersed",
  connected: "connected",
};

const text = readFileSync(csvPath, "utf8");
const [header, ...rows] = parseCsv(text);
const expected = ["filename", "sid", "tr_id", "arm", "assignment", "subject"];
if (header.map((h) => h.trim().toLowerCase()).join(",") !== expected.join(",")) {
  console.error(
    `CSV header must be exactly: ${expected.join(",")}\nGot: ${header.join(",")}`,
  );
  process.exit(1);
}

interface Row {
  filename: string;
  sid: string;
  trId: string;
  arm: "control" | "dispersed" | "connected";
  assignment: string;
  subject: string;
  excludedReason: string | null;
}

const parsed: Row[] = rows.map((r, idx) => {
  const [filename, sid, trId, armRaw, assignment, subject] = r.map((f) =>
    f.trim(),
  );
  const arm = ARM_MAP[armRaw.toLowerCase()];
  if (!filename || !sid || !trId || !arm) {
    throw new Error(
      `Row ${idx + 2}: missing/invalid field (filename/sid/tr_id/arm). arm was "${armRaw}".`,
    );
  }
  return {
    filename,
    sid,
    trId,
    arm,
    assignment,
    subject,
    excludedReason: exclusionReason(trId, subject),
  };
});

const dupes = parsed.length - new Set(parsed.map((p) => p.filename)).size;
if (dupes > 0) {
  console.error(`${dupes} duplicate filenames in the CSV. Fix and re-run.`);
  process.exit(1);
}

const excluded = parsed.filter((p) => p.excludedReason);
const codable = parsed.length - excluded.length;

// Display codes: shuffle ALL rows by seed, then number V-0001… so a code
// says nothing about school, teacher, arm, or position in the source file.
const rand = seededRandom(seed);
const order = shuffled(parsed, rand);
const codeByFilename = new Map<string, string>();
order.forEach((p, i) => {
  codeByFilename.set(p.filename, `V-${String(i + 1).padStart(4, "0")}`);
});

console.log(`CSV rows (videos):        ${parsed.length}`);
console.log(
  `Excluded — tr_id flag:    ${excluded.filter((p) => p.excludedReason?.startsWith("tr_id")).length}`,
);
console.log(
  `Excluded — language:      ${excluded.filter((p) => p.excludedReason?.startsWith("language")).length}`,
);
console.log(`Codable:                  ${codable}`);
console.log(`Seed:                     ${seed}`);
console.log(`Dataset:                  ${dataset}`);

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool, { schema });

const [{ value: existingCount }] = await db
  .select({ value: count() })
  .from(schema.videos)
  .where(eq(schema.videos.dataset, dataset));
if (Number(existingCount) > 0) {
  console.error(
    `Refusing: ${existingCount} videos already exist in dataset '${dataset}'.`,
  );
  await pool.end();
  process.exit(1);
}

await db.transaction(async (tx) => {
  for (const p of parsed) {
    const [video] = await tx
      .insert(schema.videos)
      .values({
        displayCode: codeByFilename.get(p.filename)!,
        dataset,
        status: p.excludedReason ? "void" : "pool",
      })
      .returning({ id: schema.videos.id });

    await tx.insert(schema.videoProvenance).values({
      videoId: video.id,
      rawFilename: p.filename,
      sid: p.sid,
      trId: p.trId,
      arm: p.arm,
      teacherAssignment: p.assignment || null,
      subject: p.subject || null,
      excluded: !!p.excludedReason,
      excludedReason: p.excludedReason,
      importBatch: batch,
    });
  }

  await tx.insert(schema.auditLog).values({
    action: "video_import",
    subjectTable: "videos",
    details: {
      csv: csvPath,
      seed,
      dataset,
      batch,
      total: parsed.length,
      excluded: excluded.length,
      codable,
    },
  });
});

console.log(`\nImported ${parsed.length} videos (${codable} codable).`);
await pool.end();
