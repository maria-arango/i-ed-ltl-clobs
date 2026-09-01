/**
 * Give an account two DEMO videos to try the coding workspace before real
 * assignment waves exist. Everything is created under dataset='training'
 * (ADR 0001): it never touches live data, never appears in live exports,
 * and survives the test purge. Idempotent.
 *
 * Usage: node scripts/seed-demo.mts --email maria@example.org
 */
import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.ts";
import { hardenSslMode } from "../lib/pg-url.ts";

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

const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL), max: 1 });
const db = drizzle(pool, { schema });

// Per-account demo codes (V-DEMO-MARIA-01…) so every admin can have their
// own sandbox set. María's original V-DEMO-01/02 predate this and stay.
const short = (email ?? "").split("@")[0].replace(/[^a-z]/gi, "").slice(0, 5).toUpperCase();
const demoCode = (n: string) => `V-DEMO-${short}-${n}`;

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
  const displayCode = demoCode(suffix);
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

/* ------------------------------------------------------------------ */
/* Calibration demo on V-DEMO-02: the placeholder partner has already   */
/* submitted scores, "sits" in the room (presence heartbeat pinned far  */
/* in the future so the real co-presence gate opens the moment the real */
/* user joins), and has pre-signed. Flow for the user: score and submit */
/* V-DEMO-02, open Calibration in the sidebar, enter the room, agree on */
/* each concept, sign — their signature completes the calibration.      */
/* ------------------------------------------------------------------ */

const demoVideo = await db.query.videos.findFirst({
  where: eq(schema.videos.displayCode, demoCode("02")),
});
if (demoVideo) {
  const existingSession = await db.query.calibrationSessions.findFirst({
    where: and(
      eq(schema.calibrationSessions.videoId, demoVideo.id),
      eq(schema.calibrationSessions.pairId, pair.id),
    ),
  });
  if (existingSession) {
    console.log("Calibration demo already seeded; skipping.");
  } else {
    const rubricRows = await db
      .select()
      .from(schema.rubricVersions)
      .orderBy(sql`${schema.rubricVersions.effectiveFrom} DESC NULLS LAST`)
      .limit(1);
    const rubric = rubricRows[0];
    if (!rubric) {
      console.log("No rubric seeded; skipping the calibration demo.");
    } else {
      const TRIPLE: Record<number, { c: "A" | "B"; d: "somewhat" | "very" }> = {
        1: { c: "A", d: "very" },
        2: { c: "A", d: "somewhat" },
        3: { c: "B", d: "somewhat" },
        4: { c: "B", d: "very" },
      };
      const PARTNER_SCORES = [1, 2, 3, 4, 2, 3, 1, 4];
      const JUSTIFICATIONS = [
        "Pupils worked in groups for most of the lesson and explained answers to each other.",
        "The teacher asked open questions but answered several of them herself.",
        "Pupils rarely initiated; most turns were teacher-prompted.",
        "The final task asked pupils to apply the rule to a new case.",
        "Steps were modelled once, then support was withdrawn quickly.",
        "Understanding was checked with a show of hands only.",
        "Feedback was mostly 'good' or 'correct', not specific.",
        "The example about market prices connected directly to daily life.",
      ];
      const now = new Date();
      const [partnerObs] = await db
        .insert(schema.observations)
        .values({
          videoId: demoVideo.id,
          coderId: partner.id,
          dataset: "training",
          status: "submitted",
          startedAt: now,
          submittedAt: now,
          rubricVersionId: rubric.id,
        })
        .returning();
      for (let i = 1; i <= 8; i++) {
        const n = PARTNER_SCORES[i - 1];
        await db.insert(schema.scores).values({
          observationId: partnerObs.id,
          itemNo: i,
          scoreNum: n,
          scoreColumn: TRIPLE[n].c,
          scoreDegree: TRIPLE[n].d,
          justification: JUSTIFICATIONS[i - 1],
          rubricVersionId: rubric.id,
          dataset: "training",
          submittedAt: now,
          lockedAt: now,
        });
      }
      await db.insert(schema.notes).values({
        observationId: partnerObs.id,
        dataset: "training",
        body: `<h2 style="font-size:26px;line-height:1.25;font-weight:600;margin:0.6em 0 0.4em">Lesson flow</h2><p>Clear introduction on the board, then <mark data-color="#F5E9B8" style="background-color: #F5E9B8">group work in fours</mark>. The teacher circulated and prompted quieter pupils around the middle of the lesson.</p>`,
      });

      const [session] = await db
        .insert(schema.calibrationSessions)
        .values({
          videoId: demoVideo.id,
          pairId: pair.id,
          dataset: "training",
          status: "lobby",
          rubricVersionId: rubric.id,
        })
        .returning();
      // The placeholder "sits" in the room forever, so the co-presence
      // gate opens through its normal path when the real user joins.
      await db.insert(schema.calibrationPresence).values({
        sessionId: session.id,
        userId: partner.id,
        lastSeenAt: new Date("2100-01-01T00:00:00Z"),
      });
      await db.insert(schema.calibrationSignoffs).values({
        sessionId: session.id,
        userId: partner.id,
        userAgent: "seed-demo",
      });
      console.log(
        `Calibration demo ready: score and submit ${demoCode("02")}, then open Calibration in the sidebar.`,
      );
    }
  }
}

console.log(`Demo queue ready for ${email}. Everything is dataset='training'.`);
await pool.end();
