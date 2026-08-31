/**
 * The wave lifecycle against a real database (dataset='test' — the live
 * pool is never touched): pair creation rules, preview→confirm integrity,
 * the seed in assignment_log, video status flips, exactly-one-card-filler,
 * and the changed-inputs (hash) guard.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentLog,
  assignmentRaters,
  assignments,
  auditLog,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";
import {
  confirmWave,
  createPair,
  listPairs,
  previewWave,
} from "@/lib/db/admin-assignment";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: Array.from({ length: 13 }, (_, i) => `V-TEST-WAVE-${i}`),
  emails: [
    "wave-admin@example.org",
    "wave-chief@example.org",
    "wave-enum1@example.org",
    "wave-enum2@example.org",
  ],
  pairLabels: [] as string[], // labels are generated; cleaned by id below
};

const ids = { admin: "", chief: "", enum1: "", enum2: "" };
const fixtureVideoIds: string[] = [];
const createdPairIds: string[] = [];

async function cleanPairs() {
  if (createdPairIds.length === 0) return;
  const { pairMembers, pairs } = await import("@/db/schema");
  await db.delete(pairMembers).where(inArray(pairMembers.pairId, createdPairIds));
  await db.delete(pairs).where(inArray(pairs.id, createdPairIds));
}

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const mk = async (email: string, role: "admin" | "coder", chief = false) => {
    const [u] = await db
      .insert(users)
      .values({ email, role, isChiefCoder: chief, datasetScope: "test" })
      .returning({ id: users.id });
    return u.id;
  };
  ids.admin = await mk("wave-admin@example.org", "admin");
  ids.chief = await mk("wave-chief@example.org", "coder", true);
  ids.enum1 = await mk("wave-enum1@example.org", "coder");
  ids.enum2 = await mk("wave-enum2@example.org", "coder");

  // 13 videos: 12 with arms (6 control / 3 dispersed / 3 connected across
  // 6 schools) + 1 with arm NULL (must be held back).
  const arms = [
    "control", "control", "control", "control", "control", "control",
    "dispersed", "dispersed", "dispersed",
    "connected", "connected", "connected",
  ] as const;
  for (let i = 0; i < 13; i++) {
    const [v] = await db
      .insert(videos)
      .values({ displayCode: `V-TEST-WAVE-${i}`, dataset: "test", status: "pool" })
      .returning({ id: videos.id });
    fixtureVideoIds.push(v.id);
    await db.insert(videoProvenance).values({
      videoId: v.id,
      rawFilename: `test_${i}.mp4`,
      sid: `ts${i % 6}`,
      trId: `ts${i % 6}_${i}`,
      arm: i < 12 ? arms[i] : null,
    });
  }
});

afterAll(async () => {
  // purgeFixture first: it clears assignment_log rows that reference pairs.
  await purgeFixture(FIXTURE);
  await cleanPairs();
  await db.delete(auditLog).where(eq(auditLog.action, "assignment_wave_confirmed"));
});

describe("pair rules (Amendment B §2)", () => {
  it("refuses an enumerator in the anchor seat and vice versa", async () => {
    // NOTE createPair reads live-eligibility from users regardless of scope;
    // the rule under test is the role shape.
    const wrongAnchor = await createPair(ids.admin, ids.enum1, ids.enum2, "test");
    expect(wrongAnchor).toEqual({
      ok: false,
      error: expect.stringMatching(/anchor must be an admin or a chief/i),
    });
    const wrongSeat = await createPair(ids.admin, ids.admin, ids.chief, "test");
    expect(wrongSeat).toEqual({
      ok: false,
      error: expect.stringMatching(/non-chief/i),
    });
  });

  it("forms valid pairs (admin+enum, chief+enum)", async () => {
    const a = await createPair(ids.admin, ids.admin, ids.enum1, "test");
    const b = await createPair(ids.admin, ids.chief, ids.enum2, "test");
    expect(a.ok && b.ok).toBe(true);
    const pairs = await listPairs("test");
    expect(pairs).toHaveLength(2);
    createdPairIds.push(...pairs.map((p) => p.id));
  });
});

describe("wave preview → confirm", () => {
  it("previews without writing anything", async () => {
    const r = await previewWave("test-wave-seed", 6, "test");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.totalToAssign).toBe(12);
    expect(r.preview.skippedNoArm).toBe(1);
    // Scope to THIS fixture's videos: other suites run in parallel and
    // create their own test-dataset assignments.
    const [assigned] = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(inArray(assignments.videoId, fixtureVideoIds))
      .limit(1);
    expect(assigned).toBeUndefined();
  });

  it("refuses to confirm when the pool changed since the preview", async () => {
    const r = await confirmWave(ids.admin, "test-wave-seed", 6, "stale-hash", "test");
    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/changed since this preview/i),
    });
  });

  it("confirms exactly what was previewed, with the seed on record", async () => {
    const p = await previewWave("test-wave-seed", 6, "test");
    if (!p.ok) throw new Error("preview failed");
    const r = await confirmWave(ids.admin, "test-wave-seed", 6, p.preview.hash, "test");
    expect(r).toEqual({ ok: true, waveNo: p.preview.waveNo, assigned: 12 });

    // Assignments + exactly one card filler each.
    const rows = await db
      .select({
        assignmentId: assignments.id,
        videoId: assignments.videoId,
        fills: assignmentRaters.fillsContextCard,
        userId: assignmentRaters.userId,
      })
      .from(assignments)
      .innerJoin(assignmentRaters, eq(assignmentRaters.assignmentId, assignments.id))
      .where(inArray(assignments.videoId, fixtureVideoIds));
    expect(rows).toHaveLength(24); // 12 videos × 2 raters
    const byAssignment = new Map<string, number>();
    for (const row of rows) {
      byAssignment.set(
        row.assignmentId,
        (byAssignment.get(row.assignmentId) ?? 0) + (row.fills ? 1 : 0),
      );
    }
    for (const fillers of byAssignment.values()) expect(fillers).toBe(1);

    // Videos flipped to assigned; the arm-less one stays pool.
    const vids = await db
      .select({ status: videos.status, code: videos.displayCode })
      .from(videos)
      .where(inArray(videos.id, fixtureVideoIds));
    expect(vids.filter((v) => v.status === "assigned")).toHaveLength(12);
    expect(vids.find((v) => v.code === "V-TEST-WAVE-12")?.status).toBe("pool");

    // The log carries the seed for every decision.
    const log = await db
      .select({ seed: assignmentLog.seed, action: assignmentLog.action })
      .from(assignmentLog)
      .where(and(eq(assignmentLog.dataset, "test"), eq(assignmentLog.action, "assign")));
    expect(log).toHaveLength(24);
    expect(log.every((l) => l.seed === "test-wave-seed")).toBe(true);
  });

  it("a second wave has nothing left to deal", async () => {
    const p = await previewWave("second-seed", 6, "test");
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.preview.totalToAssign).toBe(0);
  });
});
