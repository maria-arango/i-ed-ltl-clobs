/**
 * BLINDING TESTS — CLAUDE.md §2/§3, tested at the API layer.
 *
 * A synthetic scenario is seeded into the live schema under dataset='test'
 * (ADR 0001's mechanism) and removed afterwards:
 *   coder A and coder B share one video; A fills the context card and has
 *   submitted scores with a sentinel justification; B is still in progress.
 *   The video is gold-flagged and has full provenance (school 99999,
 *   arm, teacher id) so any leak would be visible in payloads.
 *
 * What must hold, per rule:
 *  - No coder-facing payload ever contains school, arm, teacher id, raw
 *    filename, or the gold flag — by key or by value pattern.
 *  - Coder B cannot obtain coder A's scores, justifications, or notes.
 *  - Coder B cannot read the context card before submitting their own
 *    scores (Amendment A), and can after.
 *  - A video not assigned to the acting coder is indistinguishable from
 *    one that does not exist (404).
 *  - The restricted database role physically cannot read the unblinded
 *    tables, independent of application code.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  assignmentRaters,
  assignments,
  contextAdults,
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
import { GET as getQueue } from "@/app/api/coder/videos/route";
import { GET as getWorkspaceRoute } from "@/app/api/coder/videos/[videoId]/route";

const mockedAuth = vi.mocked(auth);

const SENTINEL_JUSTIFICATION = "SENTINEL-A-JUSTIFICATION-73621";
const SENTINEL_NOTE = "SENTINEL-A-NOTE-73621";

/** Serialize a payload and assert nothing blinded appears, by key or value. */
function expectBlinded(payload: unknown) {
  const text = JSON.stringify(payload);
  // Forbidden keys (either naming convention).
  for (const key of [
    '"sid"',
    '"trId"',
    '"tr_id"',
    '"arm"',
    '"school"',
    '"schoolId"',
    '"school_id"',
    '"teacherAssignment"',
    '"teacher_assignment"',
    '"teacherRef"',
    '"isGold"',
    '"is_gold"',
    '"rawFilename"',
    '"raw_filename"',
    '"authoredBy"',
  ]) {
    expect(text, `payload must not contain key ${key}`).not.toContain(key);
  }
  // Forbidden value patterns: raw video/teacher ids (5-digit school prefix)
  // and arm names.
  expect(text).not.toMatch(/\d{5}_\d+/);
  expect(text).not.toMatch(/connected|dispersed/i);
  // Sentinel school id from the fixture, anywhere at all.
  expect(text).not.toContain("99999");
}

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({
    user: {
      id: userId,
      role: "coder",
      isChiefCoder: false,
      datasetScope: "test",
    },
    expires: "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function callQueue() {
  const res = await getQueue();
  return { status: res.status, body: await res.json() };
}

async function callWorkspace(videoId: string) {
  const res = await getWorkspaceRoute(new Request("http://test.local"), {
    params: Promise.resolve({ videoId }),
  });
  return { status: res.status, body: await res.json() };
}

/* ------------------------------- fixture ------------------------------ */

const ids = {
  coderA: "",
  coderB: "",
  coderC: "",
  pair: "",
  video: "",
  assignment: "",
  observationA: "",
  observationB: "",
  rubricVersion: "",
};

beforeAll(async () => {
  const [a] = await db
    .insert(users)
    .values({
      email: "blindtest-a@example.org",
      name: "Blind Test A",
      role: "coder",
      datasetScope: "test",
    })
    .returning({ id: users.id });
  const [b] = await db
    .insert(users)
    .values({
      email: "blindtest-b@example.org",
      name: "Blind Test B",
      role: "coder",
      datasetScope: "test",
    })
    .returning({ id: users.id });
  const [c] = await db
    .insert(users)
    .values({
      email: "blindtest-c@example.org",
      name: "Blind Test C",
      role: "coder",
      datasetScope: "test",
    })
    .returning({ id: users.id });
  ids.coderA = a.id;
  ids.coderB = b.id;
  ids.coderC = c.id;

  const [pair] = await db
    .insert(pairs)
    .values({ label: "blindtest-pair", dataset: "test" })
    .returning({ id: pairs.id });
  ids.pair = pair.id;
  await db.insert(pairMembers).values([
    { pairId: pair.id, userId: a.id },
    { pairId: pair.id, userId: b.id },
  ]);

  const [rubric] = await db
    .insert(rubricVersions)
    .values({ versionLabel: `blindtest-${Date.now()}` })
    .returning({ id: rubricVersions.id });
  ids.rubricVersion = rubric.id;

  const [video] = await db
    .insert(videos)
    .values({
      displayCode: "V-TEST-BLIND",
      dataset: "test",
      status: "assigned",
      isGold: true,
      driveUrl: "https://drive.google.com/file/d/blindtest/view",
    })
    .returning({ id: videos.id });
  ids.video = video.id;

  await db.insert(videoProvenance).values({
    videoId: video.id,
    rawFilename: "99999_99999_1_10_X_TESTSUBJECT_comp.mp4",
    sid: "99999",
    trId: "99999_1",
    arm: "connected",
    teacherAssignment: "Treat Y1",
    subject: "TESTSUBJECT",
  });

  const [assignment] = await db
    .insert(assignments)
    .values({
      videoId: video.id,
      pairId: pair.id,
      waveNo: 1,
      dataset: "test",
    })
    .returning({ id: assignments.id });
  ids.assignment = assignment.id;

  await db.insert(assignmentRaters).values([
    { assignmentId: assignment.id, userId: a.id, fillsContextCard: true },
    { assignmentId: assignment.id, userId: b.id, fillsContextCard: false },
  ]);

  const [obsA] = await db
    .insert(observations)
    .values({
      videoId: video.id,
      coderId: a.id,
      dataset: "test",
      status: "submitted",
      submittedAt: new Date(),
      rubricVersionId: rubric.id,
    })
    .returning({ id: observations.id });
  const [obsB] = await db
    .insert(observations)
    .values({
      videoId: video.id,
      coderId: b.id,
      dataset: "test",
      status: "in_progress",
      rubricVersionId: rubric.id,
    })
    .returning({ id: observations.id });
  ids.observationA = obsA.id;
  ids.observationB = obsB.id;

  await db.insert(scores).values({
    observationId: obsA.id,
    itemNo: 1,
    scoreNum: 3,
    scoreColumn: "B",
    scoreDegree: "somewhat",
    justification: SENTINEL_JUSTIFICATION,
    rubricVersionId: rubric.id,
    dataset: "test",
    submittedAt: new Date(),
    lockedAt: new Date(),
  });

  await db.insert(notes).values({
    observationId: obsA.id,
    videoTimestampSeconds: 62,
    body: SENTINEL_NOTE,
    dataset: "test",
  });

  const [card] = await db
    .insert(contextCards)
    .values({
      videoId: video.id,
      authoredBy: a.id,
      dataset: "test",
      status: "submitted",
      submittedAt: new Date(),
      room: "blindtest room description",
      timeline: "blindtest timeline",
    })
    .returning({ id: contextCards.id });
  await db.insert(contextAdults).values({
    contextCardId: card.id,
    adultNo: 1,
    role: "teacher",
    sex: "female",
    behavior: "blindtest behavior",
    speaks: "yes",
  });
});

afterAll(async () => {
  // Remove the fixture, children first.
  const cardRows = await db
    .select({ id: contextCards.id })
    .from(contextCards)
    .where(eq(contextCards.videoId, ids.video));
  for (const card of cardRows) {
    await db.delete(contextAdults).where(eq(contextAdults.contextCardId, card.id));
  }
  await db.delete(contextCards).where(eq(contextCards.videoId, ids.video));
  await db.delete(notes).where(eq(notes.observationId, ids.observationA));
  await db.delete(scores).where(eq(scores.observationId, ids.observationA));
  await db.delete(observations).where(eq(observations.videoId, ids.video));
  await db
    .delete(assignmentRaters)
    .where(eq(assignmentRaters.assignmentId, ids.assignment));
  await db.delete(assignments).where(eq(assignments.id, ids.assignment));
  await db.delete(videoProvenance).where(eq(videoProvenance.videoId, ids.video));
  await db.delete(videos).where(eq(videos.id, ids.video));
  await db.delete(pairMembers).where(eq(pairMembers.pairId, ids.pair));
  await db.delete(pairs).where(eq(pairs.id, ids.pair));
  await db.delete(rubricVersions).where(eq(rubricVersions.id, ids.rubricVersion));
  for (const id of [ids.coderA, ids.coderB, ids.coderC]) {
    await db.delete(users).where(eq(users.id, id));
  }
});

/* -------------------------------- tests ------------------------------- */

describe("the queue payload", () => {
  it("contains the display code and nothing blinded", async () => {
    actAs(ids.coderB);
    const { status, body } = await callQueue();
    expect(status).toBe(200);
    expect(JSON.stringify(body)).toContain("V-TEST-BLIND");
    expectBlinded(body);
  });

  it("requires a session", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const { status } = await callQueue();
    expect(status).toBe(401);
  });
});

describe("the workspace payload", () => {
  it("never contains school, arm, teacher id, raw filename, or gold flag", async () => {
    actAs(ids.coderB);
    const { status, body } = await callWorkspace(ids.video);
    expect(status).toBe(200);
    expectBlinded(body);
  });

  it("never contains the partner's scores, justifications, or notes", async () => {
    actAs(ids.coderB);
    const { body } = await callWorkspace(ids.video);
    const text = JSON.stringify(body);
    expect(text).not.toContain(SENTINEL_JUSTIFICATION);
    expect(text).not.toContain(SENTINEL_NOTE);
    // B has no scores of their own yet.
    expect(body.scores).toEqual([]);
    expect(body.notes).toEqual([]);
  });

  it("locks the context card for the non-author before their own submission (Amendment A)", async () => {
    actAs(ids.coderB);
    const { body } = await callWorkspace(ids.video);
    expect(body.contextCard.locked).toBe(true);
    expect(body.contextCard.card).toBeNull();
    expect(JSON.stringify(body)).not.toContain("blindtest room description");
  });

  it("releases the context card to the non-author after their own submission", async () => {
    await db
      .update(observations)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(observations.id, ids.observationB));

    actAs(ids.coderB);
    const { body } = await callWorkspace(ids.video);
    expect(body.contextCard.locked).toBe(false);
    expect(body.contextCard.card?.room).toBe("blindtest room description");
    expect(body.contextCard.card?.adults).toHaveLength(1);
    // Even the released card payload carries nothing blinded.
    expectBlinded(body);

    // Restore for any later test.
    await db
      .update(observations)
      .set({ status: "in_progress", submittedAt: null })
      .where(eq(observations.id, ids.observationB));
  });

  it("always shows the author their own card", async () => {
    actAs(ids.coderA);
    const { body } = await callWorkspace(ids.video);
    expect(body.contextCard.locked).toBe(false);
    expect(body.contextCard.authoredByMe).toBe(true);
    expect(body.contextCard.card?.room).toBe("blindtest room description");
  });

  it("returns 404 for a coder the video is not assigned to", async () => {
    actAs(ids.coderC);
    const { status } = await callWorkspace(ids.video);
    expect(status).toBe(404);
  });

  it("returns 404 for a video that does not exist (indistinguishable)", async () => {
    actAs(ids.coderC);
    const { status } = await callWorkspace(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(status).toBe(404);
  });
});

describe("the restricted database role (defense in depth)", () => {
  it("physically cannot read the unblinded tables or the gold flag", async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL_CODER,
      max: 1,
    });
    try {
      await expect(
        pool.query("SELECT * FROM video_provenance LIMIT 1"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        pool.query("SELECT * FROM gold_scores LIMIT 1"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        pool.query("SELECT is_gold FROM videos LIMIT 1"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        pool.query("SELECT * FROM audit_log LIMIT 1"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        pool.query("DELETE FROM scores WHERE false"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await pool.end();
    }
  });
});
