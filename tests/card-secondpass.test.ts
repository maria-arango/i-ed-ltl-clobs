/**
 * CONTEXT CARD SECOND PASS (Amendment A): after both coders have submitted
 * their own scores, the non-author reviews the card — confirm, or flag
 * with a reason; a flagged card reopens for its author, and resubmitting
 * resolves the flag and resets the confirmation.
 *
 * Guards under test:
 *  - no review before the reviewer's own scores are submitted (the same
 *    ordering rule that keeps the card from colouring first impressions);
 *  - the author can never confirm their own card;
 *  - a flag requires a reason; a flagged card cannot be confirmed;
 *  - only a flagged submitted card is editable again.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  assignmentRaters,
  assignments,
  pairMembers,
  pairs,
  users,
  videos,
} from "@/db/schema";
import {
  CoderError,
  confirmContextCard,
  ensureObservation,
  flagContextCard,
  getWorkspace,
  saveContextCard,
  saveScore,
  submitContextCard,
  submitObservation,
} from "@/lib/db/coder";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: ["V-TEST-CARDPASS"],
  emails: ["cardpass-author@example.org", "cardpass-reviewer@example.org"],
  pairLabels: ["cardpass-pair"],
};

let authorId = "";
let reviewerId = "";
let videoId = "";

async function expectCoderError(
  fn: () => Promise<unknown>,
  status: number,
  match: RegExp,
) {
  try {
    await fn();
    throw new Error("expected a CoderError");
  } catch (e) {
    expect(e).toBeInstanceOf(CoderError);
    const err = e as CoderError;
    expect(err.status).toBe(status);
    expect(err.message).toMatch(match);
  }
}

async function scoreAndSubmit(coderId: string) {
  await ensureObservation(coderId, videoId);
  for (let i = 1; i <= 8; i++) {
    await saveScore(coderId, videoId, {
      itemNo: i,
      scoreNum: ((i - 1) % 4) + 1,
      justification: `item ${i}: seen in the middle third`,
    });
  }
  await submitObservation(coderId, videoId);
}

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const [author] = await db
    .insert(users)
    .values({ email: "cardpass-author@example.org", role: "coder", isChiefCoder: true })
    .returning({ id: users.id });
  const [reviewer] = await db
    .insert(users)
    .values({ email: "cardpass-reviewer@example.org", role: "coder" })
    .returning({ id: users.id });
  authorId = author.id;
  reviewerId = reviewer.id;
  const [pair] = await db
    .insert(pairs)
    .values({ label: "cardpass-pair", dataset: "training" })
    .returning({ id: pairs.id });
  await db.insert(pairMembers).values([
    { pairId: pair.id, userId: authorId },
    { pairId: pair.id, userId: reviewerId },
  ]);
  const [video] = await db
    .insert(videos)
    .values({ displayCode: "V-TEST-CARDPASS", dataset: "training", status: "assigned" })
    .returning({ id: videos.id });
  videoId = video.id;
  const [assignment] = await db
    .insert(assignments)
    .values({ videoId, pairId: pair.id, waveNo: 1, dataset: "training" })
    .returning({ id: assignments.id });
  await db.insert(assignmentRaters).values([
    { assignmentId: assignment.id, userId: authorId, fillsContextCard: true },
    { assignmentId: assignment.id, userId: reviewerId },
  ]);
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("the card second pass", () => {
  it("author fills and submits the card", async () => {
    await saveContextCard(authorId, videoId, {
      subject: "Mathematics",
      composition: "mixed",
      approxCount: "42",
      adults: [{ adultNo: 1, role: "teacher", sex: "female", speaks: "yes" }],
    });
    const r = await submitContextCard(authorId, videoId);
    expect(r.submittedAt).toBeInstanceOf(Date);
  });

  it("no review before the reviewer submits their own scores", async () => {
    await expectCoderError(
      () => confirmContextCard(reviewerId, videoId),
      409,
      /your own scores/i,
    );
  });

  it("the author cannot confirm their own card", async () => {
    await scoreAndSubmit(authorId);
    await expectCoderError(
      () => confirmContextCard(authorId, videoId),
      403,
      /you wrote this card/i,
    );
  });

  it("a flag needs a reason; a valid flag reopens the card for its author", async () => {
    await scoreAndSubmit(reviewerId);
    await expectCoderError(
      () => flagContextCard(reviewerId, videoId, "   "),
      400,
      /what looks wrong/i,
    );
    const r = await flagContextCard(
      reviewerId,
      videoId,
      "The adult count looks off; I saw two adults.",
    );
    expect(r).toEqual({ flagged: true });

    // Confirming a flagged card is refused.
    await expectCoderError(
      () => confirmContextCard(reviewerId, videoId),
      409,
      /flagged/i,
    );

    // The author sees the flag and may edit the submitted card again.
    const ws = await getWorkspace(authorId, videoId);
    expect(ws?.contextCard.card).toMatchObject({
      flagged: true,
      flagReason: "The adult count looks off; I saw two adults.",
    });
    await saveContextCard(authorId, videoId, {
      subject: "Mathematics",
      composition: "mixed",
      approxCount: "42",
      adults: [
        { adultNo: 1, role: "teacher", sex: "female", speaks: "yes" },
        { adultNo: 2, role: "camera_operator", sex: "male", speaks: "no" },
      ],
    });
  });

  it("resubmitting resolves the flag and resets the confirmation", async () => {
    await submitContextCard(authorId, videoId);
    const ws = await getWorkspace(reviewerId, videoId);
    expect(ws?.contextCard.card).toMatchObject({
      flagged: false,
      confirmedAt: null,
      status: "submitted",
    });
    // And the card is read-only for the author again.
    await expectCoderError(
      () =>
        saveContextCard(authorId, videoId, {
          subject: "Mathematics",
          adults: [],
        }),
      409,
      /read-only/i,
    );
  });

  it("the reviewer confirms, exactly once", async () => {
    const r = await confirmContextCard(reviewerId, videoId);
    expect(r.confirmedAt).toBeInstanceOf(Date);
    const ws = await getWorkspace(reviewerId, videoId);
    expect(ws?.contextCard.card).toMatchObject({ confirmedByMe: true });
    await expectCoderError(
      () => confirmContextCard(reviewerId, videoId),
      409,
      /already confirmed/i,
    );
  });
});
