/**
 * CONTEXT CARDS BY BOTH CODERS (Amendment §43, replaces the Amendment A
 * second pass): each coder of a video fills their OWN card.
 *
 *  - two cards per video, one per author; saving never touches the other's;
 *  - the partner's card is invisible (not even its existence) until this
 *    coder submits their own scores (Amendment A ordering rule, kept);
 *  - submission of scores requires this coder's OWN submitted card;
 *  - a submitted card is read-only for its author.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentRaters,
  assignments,
  contextCards,
  pairMembers,
  pairs,
  users,
  videos,
} from "@/db/schema";
import {
  CoderError,
  ensureObservation,
  getWorkspace,
  saveContextCard,
  saveNote,
  saveScore,
  submitContextCard,
  submitObservation,
} from "@/lib/db/coder";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: ["V-TEST-TWOCARDS"],
  emails: ["twocards-a@example.org", "twocards-b@example.org"],
  pairLabels: ["twocards-pair"],
};

let aId = "";
let bId = "";
let videoId = "";

async function expectCoderError(fn: () => Promise<unknown>, status: number, match: RegExp) {
  try {
    await fn();
    throw new Error("expected a CoderError");
  } catch (e) {
    expect(e).toBeInstanceOf(CoderError);
    expect((e as CoderError).status).toBe(status);
    expect((e as CoderError).message).toMatch(match);
  }
}

async function scoreAll(coderId: string) {
  await ensureObservation(coderId, videoId);
  for (let i = 1; i <= 8; i++) {
    await saveScore(coderId, videoId, { itemNo: i, scoreNum: ((i - 1) % 4) + 1, justification: `why ${i}` });
  }
  await saveNote(coderId, videoId, { body: "<p>notes</p>" });
}

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const [a] = await db.insert(users).values({ email: FIXTURE.emails[0], role: "admin", datasetScope: "test" }).returning({ id: users.id });
  const [b] = await db.insert(users).values({ email: FIXTURE.emails[1], role: "coder", datasetScope: "test" }).returning({ id: users.id });
  aId = a.id;
  bId = b.id;
  const [pair] = await db.insert(pairs).values({ label: "twocards-pair", dataset: "test" }).returning({ id: pairs.id });
  await db.insert(pairMembers).values([
    { pairId: pair.id, userId: aId },
    { pairId: pair.id, userId: bId },
  ]);
  const [v] = await db.insert(videos).values({ displayCode: "V-TEST-TWOCARDS", dataset: "test", status: "assigned" }).returning({ id: videos.id });
  videoId = v.id;
  const [assn] = await db.insert(assignments).values({ videoId, pairId: pair.id, waveNo: 1, dataset: "test" }).returning({ id: assignments.id });
  await db.insert(assignmentRaters).values([
    { assignmentId: assn.id, userId: aId, fillsContextCard: true },
    { assignmentId: assn.id, userId: bId, fillsContextCard: true },
  ]);
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("two cards per video", () => {
  it("each coder saves their own card; two rows exist; neither sees the other's before submitting", async () => {
    await saveContextCard(aId, videoId, { composition: "mixed", approxCount: "30", room: "A's room", adults: [{ adultNo: 1, role: "teacher", sex: "female", speaks: "yes" }] });
    await saveContextCard(bId, videoId, { composition: "all_boys", approxCount: "28", room: "B's room", adults: [{ adultNo: 1, role: "teacher", sex: "male", speaks: "yes" }] });
    const rows = await db.select({ authoredBy: contextCards.authoredBy, room: contextCards.room }).from(contextCards).where(eq(contextCards.videoId, videoId));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.authoredBy === aId)?.room).toBe("A's room");
    expect(rows.find((r) => r.authoredBy === bId)?.room).toBe("B's room");

    const wsA = (await getWorkspace(aId, videoId))!;
    expect(wsA.contextCard.mine?.room).toBe("A's room");
    expect(wsA.contextCard.partnerLocked).toBe(true);
    expect(wsA.contextCard.partner).toBeNull();
    expect(JSON.stringify(wsA)).not.toContain("B's room");
  });

  it("scores cannot be submitted without this coder's OWN submitted card", async () => {
    await scoreAll(aId);
    await expectCoderError(() => submitObservation(aId, videoId), 400, /your context card/i);
  });

  it("submitting the own card unlocks submission; the submitted card is read-only", async () => {
    await submitContextCard(aId, videoId);
    await expectCoderError(
      () => saveContextCard(aId, videoId, { composition: "mixed", adults: [] }),
      409,
      /read-only/,
    );
    await expectCoderError(() => submitContextCard(aId, videoId), 409, /Already submitted/);
    const r = await submitObservation(aId, videoId);
    expect(r.submittedAt).toBeInstanceOf(Date);
  });

  it("after submitting, the partner's card becomes readable, read-only", async () => {
    const wsA = (await getWorkspace(aId, videoId))!;
    expect(wsA.contextCard.partnerLocked).toBe(false);
    expect(wsA.contextCard.partner?.room).toBe("B's room");
    // B has not submitted: still sees nothing of A's card.
    const wsB = (await getWorkspace(bId, videoId))!;
    expect(wsB.contextCard.partnerLocked).toBe(true);
    expect(wsB.contextCard.partner).toBeNull();
    expect(wsB.contextCard.mine?.room).toBe("B's room");
  });
});
