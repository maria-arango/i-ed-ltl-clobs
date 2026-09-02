/**
 * TRAINING SPACE (Amendment §29): the pack assignment (gold videos as
 * single-rater training assignments, idempotent), trainee progress, and
 * the gold-comparison dashboard's reliability arithmetic (exact, adjacent,
 * quadratic-weighted, signed lean, A/B column flips).
 *
 * Assertions are scoped to this fixture's own users/videos — other suites
 * create their own trainees and gold videos in parallel.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  goldScores,
  observations,
  rubricVersions,
  scores,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";
import {
  addTrainee,
  assignTrainingPack,
  getTrainingDashboard,
  getTraineeWork,
  listTraineesWithProgress,
  removeMyTrainingPack,
} from "@/lib/db/admin-training";
import { getCoderQueue } from "@/lib/db/coder";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: ["V-TEST-TP-1", "V-TEST-TP-2"],
  emails: ["tp-admin@example.org", "tp-trainee@example.org"],
  pairLabels: ["training-tp-trainee@example.org"],
};

let adminId = "";
let traineeId = "";
const videoIds: string[] = [];

const GOLD = [1, 2, 3, 4, 1, 2, 3, 4];
// Trainee scores on video 1: exact ×6, off-by-one ×1 (item 2: 3 vs 2 —
// which also crosses the A/B boundary), off-by-two ×1 (item 4: 2 vs 4).
// Both misses flip the column, so columnFlips = 2.
const TRAINEE = [1, 3, 3, 2, 1, 2, 3, 4];

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const [admin] = await db
    .insert(users)
    .values({ email: "tp-admin@example.org", role: "admin" })
    .returning({ id: users.id });
  adminId = admin.id;
  for (const [i, code] of ["V-TEST-TP-1", "V-TEST-TP-2"].entries()) {
    const [v] = await db
      .insert(videos)
      .values({ displayCode: code, dataset: "live", status: "void", isGold: true })
      .returning({ id: videos.id });
    videoIds.push(v.id);
    await db.insert(videoProvenance).values({
      videoId: v.id,
      rawFilename: `66001_66001_${i + 1}`,
      sid: "66001",
      trId: `66001_${i + 1}`,
      arm: "control",
    });
  }
  // Master scores for video 1 only (video 2 stays unscored → not compared).
  const [rubric] = await db
    .select({ id: rubricVersions.id })
    .from(rubricVersions)
    .orderBy(sql`${rubricVersions.effectiveFrom} DESC NULLS LAST`)
    .limit(1);
  const TRIPLE: Record<number, { c: "A" | "B"; d: "somewhat" | "very" }> = {
    1: { c: "A", d: "very" },
    2: { c: "A", d: "somewhat" },
    3: { c: "B", d: "somewhat" },
    4: { c: "B", d: "very" },
  };
  for (let i = 1; i <= 8; i++) {
    const n = GOLD[i - 1];
    await db.insert(goldScores).values({
      videoId: videoIds[0],
      itemNo: i,
      scoreNum: n,
      scoreColumn: TRIPLE[n].c,
      scoreDegree: TRIPLE[n].d,
      rubricVersionId: rubric.id,
      enteredBy: adminId,
    });
  }
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("the training pack", () => {
  it("rejects a malformed trainee email", async () => {
    const r = await addTrainee(adminId, "not-an-email", null);
    expect(r.ok).toBe(false);
  });

  it("creates the trainee and assigns every gold video, once", async () => {
    const r = await addTrainee(adminId, "tp-trainee@example.org", "Test Trainee");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // At least our two fixture gold videos are in the pack (other suites
    // may have their own gold videos in flight).
    expect(r.assigned).toBeGreaterThanOrEqual(2);
    const [trainee] = await db
      .select({ id: users.id, scope: users.datasetScope })
      .from(users)
      .where(eq(users.email, "tp-trainee@example.org"));
    traineeId = trainee.id;
    expect(trainee.scope).toBe("training");

    // Idempotent for what is already assigned: a second pass never
    // duplicates the fixture's videos (other suites may add gold videos
    // concurrently, so the global "assigned" count is not stable here).
    const again = await assignTrainingPack(adminId, traineeId);
    expect(again.ok).toBe(true);
    const { assignments, assignmentRaters } = await import("@/db/schema");
    const { and, inArray } = await import("drizzle-orm");
    const mineAfter = await db
      .select({ id: assignments.id })
      .from(assignments)
      .innerJoin(assignmentRaters, eq(assignmentRaters.assignmentId, assignments.id))
      .where(
        and(
          inArray(assignments.videoId, videoIds),
          eq(assignmentRaters.userId, traineeId),
        ),
      );
    expect(mineAfter).toHaveLength(2);

    // The trainee sees the pack in their own queue (restricted layer),
    // and each video is theirs to fill the card for.
    const queue = await getCoderQueue(traineeId);
    const mine = queue.filter((q) => FIXTURE.displayCodes.includes(q.displayCode));
    expect(mine).toHaveLength(2);
    expect(mine.every((q) => q.fillsContextCard)).toBe(true);
  });

  it("tracks progress and computes the reliability numbers", async () => {
    // The trainee submits video 1 with the planned deviations.
    const [rubric] = await db
      .select({ id: rubricVersions.id })
      .from(rubricVersions)
      .orderBy(sql`${rubricVersions.effectiveFrom} DESC NULLS LAST`)
      .limit(1);
    const TRIPLE: Record<number, { c: "A" | "B"; d: "somewhat" | "very" }> = {
      1: { c: "A", d: "very" },
      2: { c: "A", d: "somewhat" },
      3: { c: "B", d: "somewhat" },
      4: { c: "B", d: "very" },
    };
    const now = new Date();
    const [obs] = await db
      .insert(observations)
      .values({
        videoId: videoIds[0],
        coderId: traineeId,
        dataset: "training",
        status: "submitted",
        startedAt: now,
        submittedAt: now,
        rubricVersionId: rubric.id,
      })
      .returning({ id: observations.id });
    for (let i = 1; i <= 8; i++) {
      const n = TRAINEE[i - 1];
      await db.insert(scores).values({
        observationId: obs.id,
        itemNo: i,
        scoreNum: n,
        scoreColumn: TRIPLE[n].c,
        scoreDegree: TRIPLE[n].d,
        justification: `trainee item ${i}`,
        rubricVersionId: rubric.id,
        dataset: "training",
        submittedAt: now,
        lockedAt: now,
      });
    }

    const progress = (await listTraineesWithProgress()).find(
      (t) => t.userId === traineeId,
    );
    expect(progress).toMatchObject({ submitted: 1 });
    expect(progress!.assigned).toBeGreaterThanOrEqual(2);

    const dash = await getTrainingDashboard();
    const stats = dash.stats.find((s) => s.userId === traineeId)!;
    // 8 items compared: 6 exact, 7 within one, 2 column flips (items 2 and 4
    // both land on the other side of the A/B divide).
    expect(stats).toMatchObject({
      itemsCompared: 8,
      exact: 6,
      adjacent: 7,
      columnFlips: 2,
    });
    // Weighted: 6×1 + 1×(1−(1/3)²) + 1×(1−(2/3)²) over 8 = 0.9306…
    expect(stats.weighted).toBeCloseTo((6 + 8 / 9 + 5 / 9) / 8, 3);
    // Signed: (+1 on item 2, −2 on item 4) / 8 = −0.125.
    expect(stats.meanSigned).toBeCloseTo(-0.125, 3);

    const matrix = dash.videos.find((v) => v.videoId === videoIds[0])!;
    expect(matrix.items).toHaveLength(8);
    expect(matrix.items[1]).toMatchObject({ itemNo: 2, gold: 2 });
    expect(matrix.items[1].byTrainee[traineeId]).toBe(3);

    const work = await getTraineeWork(traineeId);
    const video1 = work.work.find((w) => w.videoId === videoIds[0])!;
    expect(video1.scores.find((s) => s.itemNo === 4)).toMatchObject({
      scoreNum: 2,
      gold: 4,
    });
  });

  it("removing the pack deletes the trainee's work and frees the card slots", async () => {
    const r = await removeMyTrainingPack(traineeId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.removed).toBeGreaterThanOrEqual(2);
    const { assignments, assignmentRaters } = await import("@/db/schema");
    const { and, inArray } = await import("drizzle-orm");
    const left = await db
      .select({ id: assignments.id })
      .from(assignments)
      .innerJoin(assignmentRaters, eq(assignmentRaters.assignmentId, assignments.id))
      .where(
        and(
          inArray(assignments.videoId, videoIds),
          eq(assignmentRaters.userId, traineeId),
        ),
      );
    expect(left).toHaveLength(0);
    const obsLeft = await db
      .select({ id: observations.id })
      .from(observations)
      .where(eq(observations.coderId, traineeId));
    expect(obsLeft).toHaveLength(0);
  });
});
