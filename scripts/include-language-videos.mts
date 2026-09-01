/**
 * Re-include the language-subject sessions (Amendment §28, 2026-09-01):
 * the team decided the Arabic / French / Kiswahili / Lusoga / Luganda
 * lessons ARE codable after all. Flips `excluded` off on their provenance
 * rows and returns the videos to the pool. Idempotent; audited; nothing
 * is deleted (the old reason is preserved inside the audit entry).
 *
 * Usage: node scripts/include-language-videos.mts --actor-email you@org
 */
import { config } from "dotenv";
import { and, eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.ts";
import { hardenSslMode } from "../lib/pg-url.ts";

config({ path: ".env.local" });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const actorEmail = arg("actor-email")?.trim().toLowerCase();
if (!actorEmail) {
  console.error("Usage: node scripts/include-language-videos.mts --actor-email you@org");
  process.exit(1);
}

const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL), max: 1 });
const db = drizzle(pool, { schema });

const actor = await db.query.users.findFirst({
  where: eq(schema.users.email, actorEmail),
});
if (!actor) {
  console.error(`No account for ${actorEmail}.`);
  process.exit(1);
}

const rows = await db
  .select({
    videoId: schema.videoProvenance.videoId,
    reason: schema.videoProvenance.excludedReason,
    displayCode: schema.videos.displayCode,
  })
  .from(schema.videoProvenance)
  .innerJoin(schema.videos, eq(schema.videos.id, schema.videoProvenance.videoId))
  .where(
    and(
      eq(schema.videoProvenance.excluded, true),
      like(schema.videoProvenance.excludedReason, "language subject:%"),
    ),
  );

if (rows.length === 0) {
  console.log("Nothing to include — no language-excluded sessions remain.");
} else {
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .update(schema.videoProvenance)
        .set({ excluded: false, excludedReason: null })
        .where(eq(schema.videoProvenance.videoId, r.videoId));
      await tx
        .update(schema.videos)
        .set({ status: "pool" })
        .where(eq(schema.videos.id, r.videoId));
    }
    await tx.insert(schema.auditLog).values({
      actorId: actor.id,
      action: "language_videos_included",
      subjectTable: "video_provenance",
      details: {
        count: rows.length,
        // Display codes only — never raw identifiers in logs echoed around.
        videos: rows.map((r) => ({ code: r.displayCode, was: r.reason })),
      },
    });
  });
  console.log(`Re-included ${rows.length} language-subject sessions into the pool.`);
}
await pool.end();
