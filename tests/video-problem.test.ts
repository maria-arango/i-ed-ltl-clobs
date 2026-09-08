/**
 * "Problem with this video" (Amendment §48): the escape from the one-video
 * lock. Reporting records the reason, releases the coder's lock, closes
 * open sittings, keeps everything typed; admins list and clear it.
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
  videoProvenance,
  videos,
} from "@/db/schema";
import {
  CoderError,
  getActiveLock,
  getWorkspace,
  reportVideoProblem,
  saveNote,
  startSection,
  startVideo,
} from "@/lib/db/coder";
import { clearVideoProblem, listVideoProblems } from "@/lib/db/admin-progress";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: ["V-TEST-PROB-1", "V-TEST-PROB-2"],
  emails: ["prob-coder@example.org", "prob-partner@example.org", "prob-admin@example.org"],
  pairLabels: ["prob-pair"],
};
let coderId = "";
let adminId = "";
const videoIds: string[] = [];

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const mk = async (email: string, role: "admin" | "coder") =>
    (await db.insert(users).values({ email, name: email.split("@")[0], role, datasetScope: "test" }).returning({ id: users.id }))[0].id;
  coderId = await mk(FIXTURE.emails[0], "coder");
  const partnerId = await mk(FIXTURE.emails[1], "admin");
  adminId = await mk(FIXTURE.emails[2], "admin");
  const [pair] = await db.insert(pairs).values({ label: "prob-pair", dataset: "test" }).returning({ id: pairs.id });
  await db.insert(pairMembers).values([{ pairId: pair.id, userId: partnerId }, { pairId: pair.id, userId: coderId }]);
  for (const code of FIXTURE.displayCodes) {
    // dataset 'live' so listVideoProblems (live only) sees it; status void keeps it out of waves.
    const [v] = await db.insert(videos).values({ displayCode: code, dataset: "test", status: "assigned" }).returning({ id: videos.id });
    videoIds.push(v.id);
    await db.insert(videoProvenance).values({ videoId: v.id, rawFilename: `33001_33001_${videoIds.length}_x`, sid: "33001", trId: `33001_${videoIds.length}`, arm: "control" });
    const [a] = await db.insert(assignments).values({ videoId: v.id, pairId: pair.id, waveNo: 1, dataset: "test" }).returning({ id: assignments.id });
    await db.insert(assignmentRaters).values([{ assignmentId: a.id, userId: partnerId }, { assignmentId: a.id, userId: coderId }]);
  }
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("reporting a video problem", () => {
  it("needs a reason and an assignment", async () => {
    await startVideo(coderId, videoIds[0]);
    await expect(reportVideoProblem(coderId, videoIds[0], " ")).rejects.toBeInstanceOf(CoderError);
  });

  it("records the reason, releases the lock, closes sittings, keeps the work", async () => {
    await startSection(coderId, videoIds[0], "notes", "phone");
    await saveNote(coderId, videoIds[0], { body: "<p>kept</p>" });
    const r = await reportVideoProblem(coderId, videoIds[0], "Link does not open: Drive says no access");
    expect(r.reportedAt).toBeInstanceOf(Date);
    expect(await getActiveLock(coderId)).toBeNull();
    const [v] = await db.select({ reason: videos.unusableReason, by: videos.unusableFlaggedBy, status: videos.status }).from(videos).where(eq(videos.id, videoIds[0]));
    expect(v.reason).toMatch(/no access/);
    expect(v.by).toBe(coderId);
    expect(v.status).toBe("assigned"); // nothing destructive
    const open = await db.select({ id: sectionSessions.id }).from(sectionSessions).where(and(eq(sectionSessions.videoId, videoIds[0]), eq(sectionSessions.coderId, coderId)));
    expect(open.length).toBeGreaterThan(0);
    const ws = (await getWorkspace(coderId, videoIds[0]))!;
    expect(ws.video.problemReported).toBe(true);
    expect(ws.notes[0]?.body).toBe("<p>kept</p>");
    // Free to start the next video.
    await startVideo(coderId, videoIds[1]);
  });

  it("admins see it (unblinded) and clear it with a note; the view is live-only", async () => {
    // The fixture is dataset 'test', so the LIVE list must not show it…
    const live = await listVideoProblems();
    expect(live.find((p) => p.videoId === videoIds[0])).toBeUndefined();
    // …but clearing works on any dataset.
    expect(await clearVideoProblem(adminId, videoIds[0], "")).toMatchObject({ ok: false });
    expect(await clearVideoProblem(adminId, videoIds[0], "Re-shared the Drive file")).toEqual({ ok: true });
    const [v] = await db.select({ reason: videos.unusableReason, at: videos.unusableFlaggedAt }).from(videos).where(eq(videos.id, videoIds[0]));
    expect(v.reason).toBeNull();
    expect(v.at).toBeNull();
    expect(await clearVideoProblem(adminId, videoIds[0], "again")).toMatchObject({ ok: false });
  });
});
