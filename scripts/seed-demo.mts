/**
 * Give an account two DEMO videos to try the coding workspace before real
 * assignment waves exist. Everything is created under dataset='training'
 * (ADR 0001): it never touches live data, never appears in live exports,
 * and survives the test purge. Idempotent.
 *
 * Usage: node scripts/seed-demo.mts --email maria@example.org
 */
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.ts";

config({ path: ".env.local" });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const email = arg("email")?.trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/seed-demo.mts --email someone@example.org");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool, { schema });

const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
if (!user) {
  console.error(`No account for ${email}. Create it first (npm run admin:create).`);
  process.exit(1);
}

// A placeholder partner completes the pair; it can never sign in.
let partner = await db.query.users.findFirst({
  where: eq(schema.users.email, "demo-partner@example.invalid"),
});
if (!partner) {
  [partner] = await db
    .insert(schema.users)
    .values({
      email: "demo-partner@example.invalid",
      name: "Demo partner (placeholder)",
      role: "coder",
      datasetScope: "training",
      isActive: false,
    })
    .returning();
}

let pair = await db.query.pairs.findFirst({
  where: and(eq(schema.pairs.label, `demo-${email}`), eq(schema.pairs.dataset, "training")),
});
if (!pair) {
  [pair] = await db
    .insert(schema.pairs)
    .values({ label: `demo-${email}`, dataset: "training" })
    .returning();
  await db.insert(schema.pairMembers).values([
    { pairId: pair.id, userId: user.id },
    { pairId: pair.id, userId: partner.id },
  ]);
}

for (const [suffix, fills] of [
  ["01", true],
  ["02", false],
] as const) {
  const displayCode = `V-DEMO-${suffix}`;
  let video = await db.query.videos.findFirst({
    where: eq(schema.videos.displayCode, displayCode),
  });
  if (!video) {
    [video] = await db
      .insert(schema.videos)
      .values({
        displayCode,
        dataset: "training",
        status: "assigned",
        // A public sample file so "Open in Drive" has something to open.
        driveUrl: "https://drive.google.com/",
        durationSeconds: 40 * 60,
      })
      .returning();
    const [assignment] = await db
      .insert(schema.assignments)
      .values({
        videoId: video.id,
        pairId: pair.id,
        waveNo: 0,
        dataset: "training",
        batchLabel: "demo",
      })
      .returning();
    await db.insert(schema.assignmentRaters).values([
      { assignmentId: assignment.id, userId: user.id, fillsContextCard: fills },
      { assignmentId: assignment.id, userId: partner.id, fillsContextCard: !fills },
    ]);
    console.log(`Created ${displayCode} (${fills ? "you fill the card" : "partner fills the card"}).`);
  } else {
    console.log(`${displayCode} already exists; skipping.`);
  }
}

console.log(`Demo queue ready for ${email}. Everything is dataset='training'.`);
await pool.end();
