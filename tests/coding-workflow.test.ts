/**
 * The coding write path, tested at the API layer:
 * - notes create/update/soft-delete (timestamps optional),
 * - score upsert with the fixed encoding,
 * - submission requires all 8 items and LOCKS the scores
 *   (application 409 + database trigger),
 * - dataset is stamped server-side from the account scope,
 * - only the assigned filler can write the context card.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

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
  scores,
  users,
  videos,
} from "@/db/schema";
import { PUT as putNote, DELETE as deleteNoteRoute } from "@/app/api/coder/videos/[videoId]/notes/route";
import { PUT as putScore } from "@/app/api/coder/videos/[videoId]/scores/route";
import { POST as postSubmit } from "@/app/api/coder/videos/[videoId]/submit/route";
import { PUT as putCard } from "@/app/api/coder/videos/[videoId]/context-card/route";
import { GET as getRubric } from "@/app/api/coder/rubric/route";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: ["V-TEST-WF"],
  emails: ["wf-filler@example.org", "wf-other@example.org"],
  pairLabels: ["wf-pair"],
};

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({
    user: { id: userId, role: "coder", isChiefCoder: false, datasetScope: "test" },
    expires: "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

const jsonReq = (body: unknown, method = "PUT") =>
  new Request("http://test.local", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const withParams = (videoId: string) => ({ params: Promise.resolve({ videoId }) });

const ids = { filler: "", other: "", pair: "", video: "", assignment: "" };

beforeAll(async () => {
  await purgeFixture(FIXTURE); // heal leftovers from a crashed previous run
  const [filler] = await db
    .insert(users)
    .values({ email: "wf-filler@example.org", role: "coder", datasetScope: "test" })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({ email: "wf-other@example.org", role: "coder", datasetScope: "test" })
    .returning({ id: users.id });
  ids.filler = filler.id;
  ids.other = other.id;

  const [pair] = await db
    .insert(pairs)
    .values({ label: "wf-pair", dataset: "test" })
    .returning({ id: pairs.id });
  ids.pair = pair.id;
  await db.insert(pairMembers).values([
    { pairId: pair.id, userId: filler.id },
    { pairId: pair.id, userId: other.id },
  ]);

  const [video] = await db
    .insert(videos)
    .values({ displayCode: "V-TEST-WF", dataset: "test", status: "assigned" })
    .returning({ id: videos.id });
  ids.video = video.id;

  const [assignment] = await db
    .insert(assignments)
    .values({ videoId: video.id, pairId: pair.id, waveNo: 1, dataset: "test" })
    .returning({ id: assignments.id });
  ids.assignment = assignment.id;
  await db.insert(assignmentRaters).values([
    { assignmentId: assignment.id, userId: filler.id, fillsContextCard: true },
    { assignmentId: assignment.id, userId: other.id, fillsContextCard: false },
  ]);
});

afterAll(async () => {
  // Locked test-dataset scores are deletable by design (migration 0003).
  await purgeFixture(FIXTURE);
});

describe("notes", () => {
  it("creates without a timestamp (timestamps are optional), updates, soft-deletes", async () => {
    actAs(ids.other);
    let res = await putNote(jsonReq({ body: "free-form note, no minute attached" }), withParams(ids.video));
    expect(res.status).toBe(200);
    const created = await res.json();

    res = await putNote(
      jsonReq({ noteId: created.id, body: "edited", videoTimestampSeconds: 754 }),
      withParams(ids.video),
    );
    expect(res.status).toBe(200);

    res = await deleteNoteRoute(jsonReq({ noteId: created.id }, "DELETE"), withParams(ids.video));
    expect(res.status).toBe(200);

    const row = await db.select().from(notes).where(eq(notes.id, created.id));
    expect(row[0].deletedAt).not.toBeNull(); // soft, not gone
    expect(row[0].dataset).toBe("test"); // stamped from the account scope
  });
});

describe("scores and submission", () => {
  it("rejects an illegal score number", async () => {
    actAs(ids.other);
    const res = await putScore(jsonReq({ itemNo: 1, scoreNum: 5 }), withParams(ids.video));
    expect(res.status).toBe(400);
  });

  it("refuses submission while items are missing", async () => {
    actAs(ids.other);
    const res = await postSubmit(new Request("http://t", { method: "POST" }), withParams(ids.video));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not yet scored/i);
  });

  it("accepts all 8, stores the fixed triple, then locks on submit", async () => {
    actAs(ids.other);
    // Completion needs real notes (Amendment §37); the earlier one was
    // soft-deleted, so write one that stays.
    await putNote(jsonReq({ body: "<p>kept note for submission</p>" }), withParams(ids.video));
    for (let itemNo = 1; itemNo <= 8; itemNo++) {
      const res = await putScore(
        jsonReq({ itemNo, scoreNum: ((itemNo - 1) % 4) + 1, justification: `j${itemNo}` }),
        withParams(ids.video),
      );
      expect(res.status).toBe(200);
    }
    const submit = await postSubmit(new Request("http://t", { method: "POST" }), withParams(ids.video));
    expect(submit.status).toBe(200);

    // Application refuses further edits…
    const after = await putScore(jsonReq({ itemNo: 1, scoreNum: 2 }), withParams(ids.video));
    expect(after.status).toBe(409);

    // …and the database trigger refuses even an admin-client update.
    const obs = await db
      .select({ id: observations.id })
      .from(observations)
      .where(and(eq(observations.videoId, ids.video), eq(observations.coderId, ids.other)));
    const locked = await db
      .select({ id: scores.id, scoreNum: scores.scoreNum, scoreColumn: scores.scoreColumn, dataset: scores.dataset })
      .from(scores)
      .where(eq(scores.observationId, obs[0].id));
    expect(locked).toHaveLength(8);
    expect(locked.every((s) => s.dataset === "test")).toBe(true);
    // Drizzle wraps the Postgres error; the trigger's message is the cause.
    const updateErr = await db
      .update(scores)
      .set({ scoreNum: 4, scoreColumn: "B", scoreDegree: "very" })
      .where(eq(scores.id, locked[0].id))
      .then(() => null)
      .catch((e: Error) => e);
    expect(updateErr).not.toBeNull();
    expect(String((updateErr as Error & { cause?: Error }).cause ?? updateErr)).toMatch(/locked since/);
    // DELETE of a locked LIVE score is refused; this fixture is dataset
    // 'test', where deletion is allowed for the purge action (migration
    // 0003) — cleanup below relies on exactly that.
  });
});

describe("the context card", () => {
  it("refuses writes from the coder who is not the assigned filler", async () => {
    actAs(ids.other);
    const res = await putCard(jsonReq({ room: "should not be writable", adults: [] }), withParams(ids.video));
    expect(res.status).toBe(403);
  });

  it("accepts the filler's card with adults, reconciled by adultNo", async () => {
    actAs(ids.filler);
    let res = await putCard(
      jsonReq({
        subject: "Biology",
        composition: "mixed",
        room: "one blackboard at the front",
        adults: [
          { adultNo: 1, role: "teacher", sex: "female", speaks: "yes" },
          { adultNo: 2, role: "camera_operator", sex: "unknown", speaks: "no" },
        ],
      }),
      withParams(ids.video),
    );
    expect(res.status).toBe(200);

    // Remove adult 2, keep adult 1 — reconciliation soft-deletes.
    res = await putCard(
      jsonReq({
        subject: "Biology",
        composition: "mixed",
        room: "one blackboard at the front",
        adults: [{ adultNo: 1, role: "teacher", sex: "female", speaks: "yes" }],
      }),
      withParams(ids.video),
    );
    expect(res.status).toBe(200);

    const card = await db
      .select({ id: contextCards.id, dataset: contextCards.dataset })
      .from(contextCards)
      .where(eq(contextCards.videoId, ids.video));
    expect(card[0].dataset).toBe("test");
    const adults = await db
      .select({ adultNo: contextAdults.adultNo, deletedAt: contextAdults.deletedAt })
      .from(contextAdults)
      .where(eq(contextAdults.contextCardId, card[0].id));
    expect(adults.find((a) => a.adultNo === 1)?.deletedAt).toBeNull();
    expect(adults.find((a) => a.adultNo === 2)?.deletedAt).not.toBeNull();
  });
});

describe("the rubric endpoint", () => {
  it("serves 8 concepts with anchors and the guiding rules", async () => {
    actAs(ids.other);
    const res = await getRubric();
    expect(res.status).toBe(200);
    const rubric = await res.json();
    expect(rubric.concepts).toHaveLength(8);
    expect(rubric.concepts[0].anchors["1"]).toMatch(/No opportunity is created/);
    expect(rubric.guidance.filter((g: { kind: string }) => g.kind === "reach_band")).toHaveLength(5);
    expect(rubric.fieldHelp.room).toBeTruthy();
  });
});
