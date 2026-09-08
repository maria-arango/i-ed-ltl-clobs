/**
 * ONE VIDEO AT A TIME (Amendment §45) and TIMED SECTIONS (Amendment §44).
 *
 *  - starting a video takes the coder's single lock; writes to any other
 *    assigned video are refused with 423 until the observation is submitted
 *    (or an admin releases the lock with a reason);
 *  - a section sitting opens with a device, is kept alive by heartbeats,
 *    ends on submit ('submitted') or on leaving ('closed'); a stale
 *    heartbeat is an abrupt end;
 *  - reopening after a non-submitted sitting requires a resume reason,
 *    which is written on the previous sitting;
 *  - the sittings appear in the export as clobs_sections.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentRaters,
  assignments,
  pairMembers,
  pairs,
  sectionSessions,
  users,
  videoLocks,
  videoProvenance,
  videos,
} from "@/db/schema";
import {
  CoderError,
  endSection,
  getActiveLock,
  getSectionState,
  getWorkspace,
  heartbeatSection,
  saveContextCard,
  saveNote,
  saveScore,
  startSection,
  startVideo,
  submitContextCard,
  submitObservation,
} from "@/lib/db/coder";
import { listActiveLocks, releaseVideoLock } from "@/lib/db/admin-progress";
import { buildExportTables } from "@/lib/db/admin-exports";
import { classifyDevice } from "@/lib/device";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: ["V-TEST-LOCK-1", "V-TEST-LOCK-2"],
  emails: ["lock-coder@example.org", "lock-partner@example.org", "lock-admin@example.org"],
  pairLabels: ["lock-pair"],
};

let coderId = "";
let partnerId = "";
let adminId = "";
const videoIds: string[] = [];

async function expectCoderError(fn: () => Promise<unknown>, status: number, code?: string) {
  try {
    await fn();
    throw new Error("expected a CoderError");
  } catch (e) {
    expect(e).toBeInstanceOf(CoderError);
    expect((e as CoderError).status).toBe(status);
    if (code) expect((e as CoderError).code).toBe(code);
  }
}

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const mk = async (email: string, role: "admin" | "coder") =>
    (await db.insert(users).values({ email, role, datasetScope: "test" }).returning({ id: users.id }))[0].id;
  coderId = await mk(FIXTURE.emails[0], "coder");
  partnerId = await mk(FIXTURE.emails[1], "admin");
  adminId = await mk(FIXTURE.emails[2], "admin");
  const [pair] = await db.insert(pairs).values({ label: "lock-pair", dataset: "test" }).returning({ id: pairs.id });
  await db.insert(pairMembers).values([
    { pairId: pair.id, userId: partnerId },
    { pairId: pair.id, userId: coderId },
  ]);
  for (const code of FIXTURE.displayCodes) {
    const [v] = await db.insert(videos).values({ displayCode: code, dataset: "test", status: "assigned" }).returning({ id: videos.id });
    videoIds.push(v.id);
    await db.insert(videoProvenance).values({ videoId: v.id, rawFilename: `44001_44001_${videoIds.length}`, sid: "44001", trId: `44001_${videoIds.length}`, arm: "control" });
    const [assn] = await db.insert(assignments).values({ videoId: v.id, pairId: pair.id, waveNo: 1, dataset: "test" }).returning({ id: assignments.id });
    await db.insert(assignmentRaters).values([
      { assignmentId: assn.id, userId: partnerId, fillsContextCard: true },
      { assignmentId: assn.id, userId: coderId, fillsContextCard: true },
    ]);
  }
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("device classification (pure)", () => {
  it("phones, tablets, desktops", () => {
    expect(classifyDevice("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit Mobile Safari", 393)).toBe("phone");
    expect(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile", null)).toBe("phone");
    expect(classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 1024)).toBe("tablet");
    expect(classifyDevice("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit Safari", 800)).toBe("tablet");
    expect(classifyDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome", 1440)).toBe("desktop");
    expect(classifyDevice(null, null)).toBe("unknown");
  });
});

describe("one video at a time", () => {
  it("a section cannot start before the video is started", async () => {
    await expectCoderError(() => startSection(coderId, videoIds[0], "context_card", "desktop"), 409, "video_not_started");
  });

  it("starting takes the lock; writes to another video are refused with 423", async () => {
    const r = await startVideo(coderId, videoIds[0]);
    expect(r.lock.videoId).toBe(videoIds[0]);
    expect((await getActiveLock(coderId))?.displayCode).toBe("V-TEST-LOCK-1");
    // idempotent for the same video
    await startVideo(coderId, videoIds[0]);

    await expectCoderError(() => saveNote(coderId, videoIds[1], { body: "<p>x</p>" }), 423, "locked_elsewhere");
    await expectCoderError(() => startVideo(coderId, videoIds[1]), 423, "locked_elsewhere");
    const ws2 = (await getWorkspace(coderId, videoIds[1]))!;
    expect(ws2.lock).toEqual({ holder: "other", lockedVideo: { videoId: videoIds[0], displayCode: "V-TEST-LOCK-1" } });
    const ws1 = (await getWorkspace(coderId, videoIds[0]))!;
    expect(ws1.lock.holder).toBe("this");
    // The partner is not affected by this coder's lock.
    await saveNote(partnerId, videoIds[1], { body: "<p>partner note</p>" });
  });

  it("admins see active locks and can release one with a reason", async () => {
    const locks = await listActiveLocks();
    const mine = locks.find((l) => l.coderId === coderId);
    expect(mine?.displayCode).toBe("V-TEST-LOCK-1");
    expect(await releaseVideoLock(adminId, mine!.id, "")).toMatchObject({ ok: false });
    expect(await releaseVideoLock(adminId, mine!.id, "Drive link broken, video swapped")).toEqual({ ok: true });
    expect(await getActiveLock(coderId)).toBeNull();
    // The coder can now start the other video.
    await startVideo(coderId, videoIds[1]);
    await expectCoderError(() => saveNote(coderId, videoIds[0], { body: "<p>x</p>" }), 423);
    // Back to video 1 for the rest of the suite: release again.
    const again = (await listActiveLocks()).find((l) => l.coderId === coderId)!;
    await releaseVideoLock(adminId, again.id, "test housekeeping");
    await startVideo(coderId, videoIds[0]);
  });
});

describe("timed sections", () => {
  let firstSitting = "";

  it("opens a sitting with the device, heartbeats keep it alive, leaving closes it", async () => {
    const s = await startSection(coderId, videoIds[0], "context_card", "tablet");
    firstSitting = s.sessionId;
    expect(s.resumed).toBe(false);
    expect(await heartbeatSection(coderId, s.sessionId)).toEqual({ ended: false });
    // Same sitting on a reload.
    const again = await startSection(coderId, videoIds[0], "context_card", "tablet");
    expect(again.sessionId).toBe(s.sessionId);
    const state = await getSectionState(coderId, videoIds[0], "context_card", false);
    expect(state.open?.id).toBe(s.sessionId);
    expect(state.sittings).toBe(1);

    expect(await endSection(coderId, s.sessionId)).toEqual({ ended: true });
    const [row] = await db.select().from(sectionSessions).where(eq(sectionSessions.id, s.sessionId));
    expect(row.endReason).toBe("closed");
    expect(row.device).toBe("tablet");
    // A stranger cannot touch it.
    await expectCoderError(() => heartbeatSection(partnerId, s.sessionId), 404);
  });

  it("reopening after a non-submitted sitting requires a reason, written on the previous sitting", async () => {
    const state = await getSectionState(coderId, videoIds[0], "context_card", false);
    expect(state.needsResumeReason).toBe(true);
    await expectCoderError(() => startSection(coderId, videoIds[0], "context_card", "phone"), 428, "resume_reason_required");
    const s2 = await startSection(coderId, videoIds[0], "context_card", "phone", "Network dropped");
    expect(s2.resumed).toBe(true);
    const [prev] = await db.select({ resumeReason: sectionSessions.resumeReason }).from(sectionSessions).where(eq(sectionSessions.id, firstSitting));
    expect(prev.resumeReason).toBe("Network dropped");
  });

  it("a stale heartbeat is an abrupt end", async () => {
    const [open] = await db
      .select({ id: sectionSessions.id })
      .from(sectionSessions)
      .where(and(eq(sectionSessions.coderId, coderId), eq(sectionSessions.section, "context_card"), eq(sectionSessions.videoId, videoIds[0])))
      .orderBy(sectionSessions.startedAt);
    // Age the current sitting's heartbeat by 10 minutes.
    const rows = await db.select({ id: sectionSessions.id, endedAt: sectionSessions.endedAt }).from(sectionSessions).where(eq(sectionSessions.videoId, videoIds[0]));
    const current = rows.find((r) => !r.endedAt)!;
    expect(open.id).not.toBe(current.id);
    await db.update(sectionSessions).set({ lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000) }).where(eq(sectionSessions.id, current.id));
    const state = await getSectionState(coderId, videoIds[0], "context_card", false);
    expect(state.open).toBeNull();
    expect(state.lastEndReason).toBe("abrupt");
    expect(state.needsResumeReason).toBe(true);
    // Continue with a reason; submitting the card ends the sitting as 'submitted'.
    await startSection(coderId, videoIds[0], "context_card", "desktop", "Battery / power");
    await saveContextCard(coderId, videoIds[0], { composition: "mixed", approxCount: "30", adults: [{ adultNo: 1, role: "teacher", sex: "female", speaks: "yes" }] });
    await submitContextCard(coderId, videoIds[0]);
    const after = await db.select({ endReason: sectionSessions.endReason, endedAt: sectionSessions.endedAt }).from(sectionSessions).where(and(eq(sectionSessions.videoId, videoIds[0]), eq(sectionSessions.coderId, coderId)));
    expect(after.filter((r) => r.endReason === "submitted")).toHaveLength(1);
    expect(after.every((r) => r.endedAt)).toBe(true);
  });

  it("submitting the scores ends the scores sitting and releases the lock", async () => {
    await startSection(coderId, videoIds[0], "scores", "desktop");
    for (let i = 1; i <= 8; i++) {
      await saveScore(coderId, videoIds[0], { itemNo: i, scoreNum: 2, justification: `why ${i}` });
    }
    await saveNote(coderId, videoIds[0], { body: "<p>done</p>" });
    await submitObservation(coderId, videoIds[0]);
    expect(await getActiveLock(coderId)).toBeNull();
    const lockRows = await db.select({ releaseReason: videoLocks.releaseReason }).from(videoLocks).where(and(eq(videoLocks.coderId, coderId), eq(videoLocks.videoId, videoIds[0])));
    // Two locks were taken on this video (the first was admin-released above).
    expect(lockRows.map((l) => l.releaseReason)).toContain("observation submitted");
    expect(lockRows.every((l) => l.releaseReason)).toBe(true);
    const scoresSitting = await db.select({ endReason: sectionSessions.endReason }).from(sectionSessions).where(and(eq(sectionSessions.videoId, videoIds[0]), eq(sectionSessions.section, "scores")));
    expect(scoresSitting.map((s) => s.endReason)).toEqual(["submitted"]);
  });

  it("sittings reach the export as clobs_sections with minutes and reasons", async () => {
    const built = await buildExportTables("test");
    const rows = built.rows["clobs_sections"].filter((r) => r.display_code === "V-TEST-LOCK-1" && r.coder_id === coderId);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const cardRows = rows.filter((r) => r.section === "context_card");
    expect(cardRows.map((r) => r.end_reason).sort()).toEqual(["abrupt", "closed", "submitted"]);
    expect(cardRows.find((r) => r.end_reason === "closed")?.resume_reason).toBe("Network dropped");
    expect(cardRows.find((r) => r.end_reason === "abrupt")?.resume_reason).toBe("Battery / power");
    expect(cardRows.find((r) => r.end_reason === "closed")?.device).toBe("tablet");
    for (const r of rows) expect(typeof r.minutes === "number" || r.minutes === null).toBe(true);
  });
});
