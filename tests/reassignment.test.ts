/**
 * REASSIGNMENT (addendum §6, CLAUDE.md §7): moving a pair's work preserves
 * everything and records why.
 *
 * Fixture (dataset='training' so the parallel wave suite, which sweeps
 * dataset='test' pairs, never sees it): pair P1 (anchor A1 + enumerator
 * E1) holds four videos in four states; pair P2 (A2 + E2) is the
 * destination.
 *   RA-1 untouched (E1 has card duty)
 *   RA-2 in progress: E1 wrote a note; A1 has a DRAFT card
 *   RA-3 one submitted: E1's scores are locked
 *   RA-4 both submitted (awaiting calibration)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentLog,
  assignmentRaters,
  assignments,
  contextCards,
  notes,
  observations,
  pairMembers,
  pairs,
  rubricVersions,
  scores,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";
import { confirmMove, previewMove } from "@/lib/db/admin-reassignment";
import { dissolvePair } from "@/lib/db/admin-assignment";
import { getCoderQueue } from "@/lib/db/coder";
import { purgeFixture } from "./fixtures";

const CODES = ["V-TEST-RA-1", "V-TEST-RA-2", "V-TEST-RA-3", "V-TEST-RA-4"];
const FIXTURE = {
  displayCodes: CODES,
  emails: ["ra-a1@example.org", "ra-e1@example.org", "ra-a2@example.org", "ra-e2@example.org"],
  pairLabels: ["ra-pair-1", "ra-pair-2"],
};

const ids = { A1: "", E1: "", A2: "", E2: "", P1: "", P2: "" };
const videoIds: string[] = [];
const assignmentIds: string[] = [];

const TRIPLE: Record<number, { c: "A" | "B"; d: "somewhat" | "very" }> = {
  1: { c: "A", d: "very" },
  2: { c: "A", d: "somewhat" },
  3: { c: "B", d: "somewhat" },
  4: { c: "B", d: "very" },
};

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const mkUser = async (email: string, role: "admin" | "coder") => {
    const [u] = await db.insert(users).values({ email, name: email.split("@")[0], role }).returning({ id: users.id });
    return u.id;
  };
  ids.A1 = await mkUser(FIXTURE.emails[0], "admin");
  ids.E1 = await mkUser(FIXTURE.emails[1], "coder");
  ids.A2 = await mkUser(FIXTURE.emails[2], "admin");
  ids.E2 = await mkUser(FIXTURE.emails[3], "coder");

  const mkPair = async (label: string, anchor: string, enumerator: string) => {
    const [p] = await db.insert(pairs).values({ label, dataset: "training" }).returning({ id: pairs.id });
    await db.insert(pairMembers).values([
      { pairId: p.id, userId: anchor },
      { pairId: p.id, userId: enumerator },
    ]);
    return p.id;
  };
  ids.P1 = await mkPair("ra-pair-1", ids.A1, ids.E1);
  ids.P2 = await mkPair("ra-pair-2", ids.A2, ids.E2);

  for (const [i, code] of CODES.entries()) {
    const [v] = await db
      .insert(videos)
      .values({ displayCode: code, dataset: "training", status: "assigned" })
      .returning({ id: videos.id });
    videoIds.push(v.id);
    await db.insert(videoProvenance).values({
      videoId: v.id,
      rawFilename: `55001_55001_${i + 1}`,
      sid: "55001",
      trId: `55001_${i + 1}`,
      arm: "connected",
    });
    const [a] = await db
      .insert(assignments)
      .values({ videoId: v.id, pairId: ids.P1, waveNo: 3, dataset: "training", assignedBy: ids.A1 })
      .returning({ id: assignments.id });
    assignmentIds.push(a.id);
    // Card duty: E1 on RA-1 and RA-3, A1 on RA-2 and RA-4.
    const dutyOnAnchor = i % 2 === 1;
    await db.insert(assignmentRaters).values([
      { assignmentId: a.id, userId: ids.A1, fillsContextCard: dutyOnAnchor },
      { assignmentId: a.id, userId: ids.E1, fillsContextCard: !dutyOnAnchor },
    ]);
  }

  const [rubric] = await db
    .select({ id: rubricVersions.id })
    .from(rubricVersions)
    .orderBy(sql`${rubricVersions.effectiveFrom} DESC NULLS LAST`)
    .limit(1);
  const now = new Date();

  // RA-2: E1 wrote a note, A1 drafted the card.
  const [obs2] = await db
    .insert(observations)
    .values({ videoId: videoIds[1], coderId: ids.E1, dataset: "training", status: "in_progress", startedAt: now, rubricVersionId: rubric.id })
    .returning({ id: observations.id });
  await db.insert(notes).values({ observationId: obs2.id, body: "<p>Teacher circulates.</p>", dataset: "training" });
  await db.insert(contextCards).values({ videoId: videoIds[1], authoredBy: ids.A1, dataset: "training", status: "draft", subject: "Maths" });

  const submit = async (videoId: string, coderId: string) => {
    const [obs] = await db
      .insert(observations)
      .values({ videoId, coderId, dataset: "training", status: "submitted", startedAt: now, submittedAt: now, rubricVersionId: rubric.id })
      .returning({ id: observations.id });
    for (let i = 1; i <= 8; i++) {
      const n = ((i - 1) % 4) + 1;
      await db.insert(scores).values({
        observationId: obs.id,
        itemNo: i,
        scoreNum: n,
        scoreColumn: TRIPLE[n].c,
        scoreDegree: TRIPLE[n].d,
        justification: "because",
        rubricVersionId: rubric.id,
        dataset: "training",
        submittedAt: now,
        lockedAt: now,
      });
    }
  };
  // RA-3: E1 submitted. RA-4: both submitted.
  await submit(videoIds[2], ids.E1);
  await submit(videoIds[3], ids.E1);
  await submit(videoIds[3], ids.A1);
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("preview", () => {
  it("classifies each video and refuses same-pair moves", async () => {
    expect(await previewMove({ fromPairId: ids.P1, toPairId: ids.P1, includeSubmitted: false })).toMatchObject({ ok: false });

    const r = await previewMove({ fromPairId: ids.P1, toPairId: ids.P2, includeSubmitted: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byCode = Object.fromEntries(r.preview.rows.map((x) => [x.displayCode, x]));
    expect(byCode["V-TEST-RA-1"]).toMatchObject({ state: "untouched", action: "transfer", cardDuty: "enumerator", cardStatus: "none" });
    expect(byCode["V-TEST-RA-2"]).toMatchObject({ state: "in_progress", action: "transfer", cardDuty: "anchor", cardStatus: "draft" });
    expect(byCode["V-TEST-RA-3"]).toMatchObject({ state: "one_submitted", action: "hold", submittedSeats: ["enumerator"] });
    expect(byCode["V-TEST-RA-4"]).toMatchObject({ state: "both_submitted", action: "hold" });
    expect(r.preview.counts).toEqual({ return_to_pool: 0, transfer: 2, hold: 2 });
    expect(r.preview.seats.anchor.to?.id).toBe(ids.A2);
    expect(byCode["V-TEST-RA-2"].note).toMatch(/draft card passes to ra-a2/);
  });

  it("with 'include submitted', a one-submitted video moves (scores kept as evidence)", async () => {
    const r = await previewMove({ fromPairId: ids.P1, toPairId: ids.P2, includeSubmitted: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ra3 = r.preview.rows.find((x) => x.displayCode === "V-TEST-RA-3")!;
    expect(ra3.action).toBe("transfer");
    expect(ra3.note).toMatch(/stay on record/);
    expect(r.preview.counts).toEqual({ return_to_pool: 0, transfer: 3, hold: 1 });
  });

  it("without a destination, only untouched videos return to the pool", async () => {
    const r = await previewMove({ fromPairId: ids.P1, toPairId: null, includeSubmitted: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byCode = Object.fromEntries(r.preview.rows.map((x) => [x.displayCode, x.action]));
    expect(byCode).toEqual({
      "V-TEST-RA-1": "return_to_pool",
      "V-TEST-RA-2": "hold",
      "V-TEST-RA-3": "hold",
      "V-TEST-RA-4": "hold",
    });
  });
});

describe("confirm", () => {
  it("refuses a missing reason and a stale preview", async () => {
    const r = await previewMove({ fromPairId: ids.P1, toPairId: ids.P2, includeSubmitted: true });
    if (!r.ok) throw new Error(r.error);
    expect(
      await confirmMove(ids.A1, { fromPairId: ids.P1, toPairId: ids.P2, includeSubmitted: true, reason: "", expectedHash: r.preview.hash }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/reason/i) });
    expect(
      await confirmMove(ids.A1, { fromPairId: ids.P1, toPairId: ids.P2, includeSubmitted: true, reason: "E1 left the project", expectedHash: "stale" }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/Preview again/) });
    // Nothing changed.
    const [still] = await db.select({ status: assignments.status }).from(assignments).where(eq(assignments.id, assignmentIds[0]));
    expect(still.status).toBe("active");
  });

  it("moves the work: pool for nothing, transfer with provenance, submitted scores preserved, both-submitted held", async () => {
    const r = await previewMove({ fromPairId: ids.P1, toPairId: ids.P2, includeSubmitted: true });
    if (!r.ok) throw new Error(r.error);
    const c = await confirmMove(ids.A1, {
      fromPairId: ids.P1,
      toPairId: ids.P2,
      includeSubmitted: true,
      reason: "E1 left the project",
      expectedHash: r.preview.hash,
    });
    expect(c).toEqual({ ok: true, result: { transferred: 3, returned: 0, held: 1 } });

    // Old assignments 1–3 are 'returned' (never deleted); 4 stays active.
    const old = await db
      .select({ id: assignments.id, status: assignments.status, reason: assignments.statusReason })
      .from(assignments)
      .where(eq(assignments.pairId, ids.P1));
    expect(old.find((a) => a.id === assignmentIds[0])?.status).toBe("returned");
    expect(old.find((a) => a.id === assignmentIds[2])?.reason).toMatch(/E1 left the project/);
    expect(old.find((a) => a.id === assignmentIds[3])?.status).toBe("active");

    // New assignments for P2 on videos 1–3, with both seats.
    const fresh = await db
      .select({ id: assignments.id, videoId: assignments.videoId, waveNo: assignments.waveNo, status: assignments.status })
      .from(assignments)
      .where(eq(assignments.pairId, ids.P2));
    expect(fresh.map((a) => a.videoId).sort()).toEqual(videoIds.slice(0, 3).sort());
    expect(fresh.every((a) => a.waveNo === 3 && a.status === "active")).toBe(true);

    // Card duty travelled: RA-1 duty (E1) → E2; RA-2 draft card re-authored to A2.
    const ra1new = fresh.find((a) => a.videoId === videoIds[0])!;
    const ra1raters = await db.select().from(assignmentRaters).where(eq(assignmentRaters.assignmentId, ra1new.id));
    expect(ra1raters.find((x) => x.userId === ids.E2)?.fillsContextCard).toBe(true);
    expect(ra1raters.find((x) => x.userId === ids.A2)?.fillsContextCard).toBe(false);
    const [card] = await db.select({ authoredBy: contextCards.authoredBy, status: contextCards.status }).from(contextCards).where(eq(contextCards.videoId, videoIds[1]));
    expect(card).toEqual({ authoredBy: ids.A2, status: "draft" });

    // E1's note on RA-2 and E1's locked scores on RA-3 still exist.
    const [e1obs2] = await db.select({ id: observations.id }).from(observations).where(and(eq(observations.videoId, videoIds[1]), eq(observations.coderId, ids.E1)));
    const noteRows = await db.select({ id: notes.id }).from(notes).where(eq(notes.observationId, e1obs2.id));
    expect(noteRows).toHaveLength(1);
    const [e1obs3] = await db.select({ id: observations.id, status: observations.status }).from(observations).where(and(eq(observations.videoId, videoIds[2]), eq(observations.coderId, ids.E1)));
    expect(e1obs3.status).toBe("submitted");
    const lockedScores = await db.select({ id: scores.id }).from(scores).where(eq(scores.observationId, e1obs3.id));
    expect(lockedScores).toHaveLength(8);

    // E1's RA-3 seat is voided (submitted, departing); A1's RA-3 seat transferred.
    const ra3old = await db.select().from(assignmentRaters).where(eq(assignmentRaters.assignmentId, assignmentIds[2]));
    expect(ra3old.find((x) => x.userId === ids.E1)?.status).toBe("voided");
    expect(ra3old.find((x) => x.userId === ids.A1)?.status).toBe("transferred");

    // The log tells the story: reassign ×6 (3 videos × 2 seats), duty transfers, one void.
    const log = await db
      .select({ action: assignmentLog.action, videoId: assignmentLog.videoId, toUserId: assignmentLog.toUserId })
      .from(assignmentLog)
      .where(and(eq(assignmentLog.fromPairId, ids.P1), eq(assignmentLog.dataset, "training")));
    expect(log.filter((l) => l.action === "reassign")).toHaveLength(6);
    expect(log.filter((l) => l.action === "void")).toHaveLength(1);
    expect(log.filter((l) => l.action === "transfer_card_duty").map((l) => l.videoId).sort()).toEqual(videoIds.slice(0, 3).sort());

    // Queues: E2 now sees 1–3; E1 keeps only RA-4.
    const e2 = (await getCoderQueue(ids.E2)).map((q) => q.displayCode).sort();
    expect(e2).toEqual(["V-TEST-RA-1", "V-TEST-RA-2", "V-TEST-RA-3"]);
    const e1 = (await getCoderQueue(ids.E1)).map((q) => q.displayCode);
    expect(e1).toEqual(["V-TEST-RA-4"]);
    // Videos never went back to the pool (they were transferred).
    const [v1] = await db.select({ status: videos.status }).from(videos).where(eq(videos.id, videoIds[0]));
    expect(v1.status).toBe("assigned");

    // The old pair still holds RA-4, so it cannot be dissolved yet.
    expect((await dissolvePair(ids.A1, ids.P1)).ok).toBe(false);
  });

  it("returning an untouched video to the pool", async () => {
    // Give P2 a fresh untouched video by moving RA-1 back to the pool.
    const r = await previewMove({ fromPairId: ids.P2, toPairId: null, includeSubmitted: false });
    if (!r.ok) throw new Error(r.error);
    const byCode = Object.fromEntries(r.preview.rows.map((x) => [x.displayCode, x.action]));
    expect(byCode["V-TEST-RA-1"]).toBe("return_to_pool");
    expect(byCode["V-TEST-RA-2"]).toBe("hold"); // draft card + note exist
    // RA-3: P2's coders never started it (E1's voided submission belongs to
    // the old assignment), so for THIS pair it is untouched.
    expect(byCode["V-TEST-RA-3"]).toBe("return_to_pool");
    const c = await confirmMove(ids.A2, { fromPairId: ids.P2, toPairId: null, includeSubmitted: false, reason: "wave was too big", expectedHash: r.preview.hash });
    expect(c.ok).toBe(true);
    const [v1] = await db.select({ status: videos.status }).from(videos).where(eq(videos.id, videoIds[0]));
    expect(v1.status).toBe("pool");
    expect((await getCoderQueue(ids.E2)).map((q) => q.displayCode).sort()).toEqual(["V-TEST-RA-2"]);
    const pooled = await db
      .select({ action: assignmentLog.action })
      .from(assignmentLog)
      .where(and(eq(assignmentLog.videoId, videoIds[0]), eq(assignmentLog.action, "return_to_pool")));
    expect(pooled).toHaveLength(1);
  });
});
