/**
 * GOLD SET, CERTIFICATION AND DRIVE-LINK ATTACHMENT (admin layer).
 *
 *  - Master scores: fixed-encoding validation, upsert, gold-flag guard.
 *  - Certification: agreement (exact / adjacent on the ordinal scale)
 *    computed against master scores; a pass promotes the trainee to live;
 *    a non-trainee cannot be certified.
 *  - Drive links: filename→session prefix matching, ambiguity on the
 *    duplicate-session teachers, URL validation, and the write.
 *
 * Fixture videos are created with status 'void' so they can never enter a
 * live assignment wave while the suite runs; displayCodes are V-TEST-*.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  certifications,
  observations,
  rubricVersions,
  scores,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  decideCertification,
  getGoldEntry,
  getTraineeAgreement,
  saveGoldScores,
  setGoldFlag,
} from "@/lib/db/admin-gold";
import {
  confirmDriveLinks,
  parseDriveLines,
  previewDriveLinks,
} from "@/lib/db/admin-videos";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: ["V-TEST-GOLD-1", "V-TEST-GOLD-2A", "V-TEST-GOLD-2B"],
  emails: ["goldtest-admin@example.org", "goldtest-trainee@example.org"],
  pairLabels: [] as string[],
};

let adminId = "";
let traineeId = "";
let goldVideoId = "";
let dupAId = "";

const GOLD = [1, 2, 3, 4, 1, 2, 3, 4];
// Trainee: exact on 6 items, off by one on item 2 (3 vs 2), off by two on
// item 4 (2 vs 4) → exact 6/8, adjacent 7/8.
const TRAINEE = [1, 3, 3, 2, 1, 2, 3, 4];

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const [admin] = await db
    .insert(users)
    .values({ email: "goldtest-admin@example.org", role: "admin" })
    .returning({ id: users.id });
  adminId = admin.id;
  const [trainee] = await db
    .insert(users)
    .values({
      email: "goldtest-trainee@example.org",
      name: "Gold Trainee",
      role: "coder",
      datasetScope: "training",
    })
    .returning({ id: users.id });
  traineeId = trainee.id;

  const mkVideo = async (code: string, raw: string, sid: string, trId: string) => {
    const [v] = await db
      .insert(videos)
      // 'void' keeps these out of any live wave pool while the suite runs.
      .values({ displayCode: code, dataset: "live", status: "void" })
      .returning({ id: videos.id });
    await db.insert(videoProvenance).values({
      videoId: v.id,
      rawFilename: raw,
      sid,
      trId,
      arm: "control",
    });
    return v.id;
  };
  goldVideoId = await mkVideo(
    "V-TEST-GOLD-1",
    "77001_77001_5_9_A_PHYSICS_comp.mp4",
    "77001",
    "77001_5",
  );
  dupAId = await mkVideo("V-TEST-GOLD-2A", "77002_77002_3", "77002", "77002_3");
  await mkVideo("V-TEST-GOLD-2B", "77002_77002_3~2", "77002", "77002_3");

  // The trainee has SUBMITTED the gold video in the training sandbox.
  const [rubric] = await db
    .select({ id: rubricVersions.id })
    .from(rubricVersions)
    .orderBy(sql`${rubricVersions.effectiveFrom} DESC NULLS LAST`)
    .limit(1);
  const now = new Date();
  const [obs] = await db
    .insert(observations)
    .values({
      videoId: goldVideoId,
      coderId: traineeId,
      dataset: "training",
      status: "submitted",
      startedAt: now,
      submittedAt: now,
      rubricVersionId: rubric.id,
    })
    .returning({ id: observations.id });
  const TRIPLE: Record<number, { c: "A" | "B"; d: "somewhat" | "very" }> = {
    1: { c: "A", d: "very" },
    2: { c: "A", d: "somewhat" },
    3: { c: "B", d: "somewhat" },
    4: { c: "B", d: "very" },
  };
  for (let i = 1; i <= 8; i++) {
    const n = TRAINEE[i - 1];
    await db.insert(scores).values({
      observationId: obs.id,
      itemNo: i,
      scoreNum: n,
      scoreColumn: TRIPLE[n].c,
      scoreDegree: TRIPLE[n].d,
      rubricVersionId: rubric.id,
      dataset: "training",
      submittedAt: now,
      lockedAt: now,
    });
  }
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("gold set", () => {
  it("refuses master scores for a video that is not gold-flagged", async () => {
    const r = await saveGoldScores(adminId, goldVideoId, [
      { itemNo: 1, scoreNum: 1, rationale: null },
    ]);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/not in the gold set/i) });
  });

  it("flags a video gold and accepts the full set of master scores", async () => {
    expect(await setGoldFlag(adminId, goldVideoId, true)).toEqual({ ok: true });
    const items = GOLD.map((n, i) => ({
      itemNo: i + 1,
      scoreNum: n,
      rationale: i === 0 ? "Clear group work throughout." : null,
    }));
    expect(await saveGoldScores(adminId, goldVideoId, items)).toEqual({
      ok: true,
      saved: 8,
    });
    const entry = await getGoldEntry(goldVideoId);
    expect(entry?.existing).toHaveLength(8);
    expect(entry?.existing[0]).toMatchObject({ scoreNum: 1 });
  });

  it("rejects illegal scores and revises by upsert", async () => {
    const bad = await saveGoldScores(adminId, goldVideoId, [
      { itemNo: 3, scoreNum: 7, rationale: null },
    ]);
    expect(bad.ok).toBe(false);
    const revise = await saveGoldScores(adminId, goldVideoId, [
      { itemNo: 3, scoreNum: 4, rationale: "Revised after team discussion." },
    ]);
    expect(revise.ok).toBe(true);
    const entry = await getGoldEntry(goldVideoId);
    expect(entry?.existing.find((e) => e.itemNo === 3)).toMatchObject({
      scoreNum: 4,
    });
    // put it back for the agreement test
    await saveGoldScores(adminId, goldVideoId, [
      { itemNo: 3, scoreNum: 3, rationale: null },
    ]);
  });

  it("refuses to un-gold a video once master scores exist", async () => {
    const r = await setGoldFlag(adminId, goldVideoId, false);
    expect(r.ok).toBe(false);
  });
});

describe("certification", () => {
  it("computes exact and adjacent agreement against the master scores", async () => {
    const rows = await getTraineeAgreement();
    const mine = rows.find((r) => r.userId === traineeId);
    expect(mine).toMatchObject({
      goldVideosCoded: 1,
      itemsCompared: 8,
      exact: 6,
      adjacent: 7,
    });
  });

  it("a pass promotes the trainee to the live dataset, once", async () => {
    expect(await decideCertification(adminId, traineeId, "passed")).toEqual({
      ok: true,
    });
    const [u] = await db
      .select({ scope: users.datasetScope })
      .from(users)
      .where(eq(users.id, traineeId));
    expect(u.scope).toBe("live");
    const certs = await db
      .select({ status: certifications.status, attemptNo: certifications.attemptNo })
      .from(certifications)
      .where(eq(certifications.userId, traineeId));
    expect(certs).toEqual([{ status: "passed", attemptNo: 1 }]);

    // Already live → cannot be certified again.
    const again = await decideCertification(adminId, traineeId, "passed");
    expect(again.ok).toBe(false);
  });
});

describe("drive-link attachment", () => {
  it("parses lines in any order and flags unreadable ones", () => {
    const { entries, invalid } = parseDriveLines(
      "a_file.mp4 https://drive.google.com/file/d/1\nhttps://drive.google.com/file/d/2\tb_file.mp4\nnot a line\n",
    );
    expect(entries).toEqual([
      { filename: "a_file.mp4", url: "https://drive.google.com/file/d/1" },
      { filename: "b_file.mp4", url: "https://drive.google.com/file/d/2" },
    ]);
    expect(invalid).toEqual(["not a line"]);
  });

  it("matches by prefix, reports duplicates as ambiguous, unknown as unmatched", async () => {
    const preview = await previewDriveLinks(
      [
        "77001_77001_5_9_A_PHYSICS_comp.mp4 https://drive.google.com/file/d/AAA/view",
        "77002_77002_3_10_B_CHEMISTRY_comp.mp4 https://drive.google.com/file/d/BBB/view",
        "88888888_1_x_comp.mp4 https://drive.google.com/file/d/CCC/view",
      ].join("\n"),
    );
    expect(preview.matched).toHaveLength(1);
    expect(preview.matched[0]).toMatchObject({
      displayCode: "V-TEST-GOLD-1",
      url: "https://drive.google.com/file/d/AAA/view",
    });
    expect(preview.ambiguous).toHaveLength(1);
    expect(preview.ambiguous[0].candidates.map((c) => c.displayCode).sort()).toEqual([
      "V-TEST-GOLD-2A",
      "V-TEST-GOLD-2B",
    ]);
    expect(preview.unmatched).toEqual(["88888888_1_x_comp.mp4"]);
  });

  it("refuses non-Drive URLs and writes accepted ones", async () => {
    const bad = await confirmDriveLinks(adminId, [
      { videoId: goldVideoId, url: "https://example.com/video.mp4" },
    ]);
    expect(bad.ok).toBe(false);

    const good = await confirmDriveLinks(adminId, [
      { videoId: goldVideoId, url: "https://drive.google.com/file/d/AAA/view" },
      { videoId: dupAId, url: "https://drive.google.com/file/d/BBB/view" },
    ]);
    expect(good).toEqual({ ok: true, attached: 2 });
    const [v] = await db
      .select({ driveUrl: videos.driveUrl })
      .from(videos)
      .where(eq(videos.id, goldVideoId));
    expect(v.driveUrl).toBe("https://drive.google.com/file/d/AAA/view");
  });
});
