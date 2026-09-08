/**
 * Attach Google Drive links from a LOCALLY MOUNTED Drive folder (Google
 * Drive for desktop, macOS). Each file carries its Drive item id as an
 * extended attribute (`com.google.drivefs.item-id#S`), so the link is
 * https://drive.google.com/file/d/<id>/view — no copying by hand.
 *
 * Matching mirrors lib/db/admin-videos.ts: exact raw-filename match first,
 * otherwise a unique `{sid}_{tr_id}_` prefix. Raw filenames encode school
 * ids (CLAUDE.md §3): this script prints DISPLAY CODES ONLY, and the
 * "filename  url" lines it writes go under data/ (gitignored) for the
 * record.
 *
 * Usage:
 *   node scripts/attach-drive-links-from-folder.mts --folder "/path/to/03c_Videos"            (preview)
 *   node scripts/attach-drive-links-from-folder.mts --folder "..." --confirm --email you@x.org (write)
 */
import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.ts";
import { hardenSslMode } from "../lib/pg-url.ts";

config({ path: ".env.local" });

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const folder = arg("folder");
const confirm = process.argv.includes("--confirm");
const email = arg("email")?.trim().toLowerCase();
if (!folder) {
  console.error("Usage: node scripts/attach-drive-links-from-folder.mts --folder <path> [--confirm --email you@x.org]");
  process.exit(1);
}
if (confirm && !email) {
  console.error("--confirm needs --email <admin account> so the change is attributed in the audit log.");
  process.exit(1);
}

const VIDEO_EXT = /\.(mp4|mov|mkv|avi|webm)$/i;
const files = readdirSync(folder)
  .filter((f) => VIDEO_EXT.test(f) && statSync(join(folder, f)).isFile())
  .sort();

function driveId(path: string): string | null {
  try {
    const out = execFileSync("xattr", ["-p", "com.google.drivefs.item-id#S", path], { encoding: "utf8" }).trim();
    return /^[A-Za-z0-9_-]{20,}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

const entries = files.map((f) => ({ filename: f, id: driveId(join(folder, f)) }));
const withId = entries.filter((e) => e.id) as Array<{ filename: string; id: string }>;
console.log(`Folder: ${files.length} video files, ${withId.length} with a Drive id.`);
if (withId.length < files.length) {
  console.log(`  ${files.length - withId.length} file(s) had no Drive id (not synced yet?) — skipped.`);
}

// Record the lines under data/ (gitignored) so the attachment is reproducible.
mkdirSync("data", { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const linesPath = join("data", `drive-links-${stamp}.txt`);
writeFileSync(
  linesPath,
  withId.map((e) => `${e.filename}\thttps://drive.google.com/file/d/${e.id}/view`).join("\n") + "\n",
);
console.log(`Wrote ${linesPath} (raw filenames — stays under data/, never committed).`);

const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL), max: 1 });
const db = drizzle(pool, { schema });

const provenance = await db
  .select({
    videoId: schema.videoProvenance.videoId,
    rawFilename: schema.videoProvenance.rawFilename,
    sid: schema.videoProvenance.sid,
    trId: schema.videoProvenance.trId,
    displayCode: schema.videos.displayCode,
    driveUrl: schema.videos.driveUrl,
  })
  .from(schema.videoProvenance)
  .innerJoin(schema.videos, eq(schema.videos.id, schema.videoProvenance.videoId))
  .where(and(eq(schema.videos.dataset, "live"), eq(schema.videoProvenance.excluded, false)));

const strip = (n: string) => n.replace(VIDEO_EXT, "");
const matched: Array<{ videoId: string; displayCode: string; url: string; replaces: boolean }> = [];
const ambiguous: Array<{ candidates: string[] }> = [];
let unmatched = 0;

for (const e of withId) {
  const base = strip(e.filename);
  const url = `https://drive.google.com/file/d/${e.id}/view`;
  const exact = provenance.filter((p) => strip(p.rawFilename) === base);
  const candidates = exact.length ? exact : provenance.filter((p) => base.startsWith(`${p.sid}_${p.trId}_`) || base === `${p.sid}_${p.trId}`);
  if (candidates.length === 1) {
    matched.push({ videoId: candidates[0].videoId, displayCode: candidates[0].displayCode, url, replaces: !!candidates[0].driveUrl });
  } else if (candidates.length > 1) {
    ambiguous.push({ candidates: candidates.map((c) => c.displayCode) });
  } else {
    unmatched++;
  }
}

console.log(`Matched ${matched.length} (${matched.filter((m) => m.replaces).length} already had a link), ambiguous ${ambiguous.length}, unmatched ${unmatched}.`);
console.log(`Matched codes: ${matched.map((m) => m.displayCode).sort().join(" ")}`);
for (const a of ambiguous) console.log(`  ambiguous between ${a.candidates.join(" / ")} (attach by code in the Video library)`);

if (confirm) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email!) });
  if (!user || user.role !== "admin") {
    console.error(`No admin account for ${email}.`);
    process.exit(1);
  }
  await db.transaction(async (tx) => {
    for (const m of matched) {
      await tx.update(schema.videos).set({ driveUrl: m.url }).where(eq(schema.videos.id, m.videoId));
    }
    await tx.insert(schema.auditLog).values({
      actorId: user.id,
      action: "drive_links_attached",
      subjectTable: "videos",
      details: { count: matched.length, source: "attach-drive-links-from-folder", folderFiles: files.length },
    });
  });
  console.log(`Attached ${matched.length} links (audited as ${email}).`);
} else {
  console.log("Preview only. Re-run with --confirm --email <admin> to write.");
}
await pool.end();
