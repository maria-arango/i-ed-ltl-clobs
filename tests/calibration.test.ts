/**
 * CALIBRATION ROOM TESTS — the co-presence gate (CLAUDE.md §2) at the API
 * layer, plus consensus mechanics and post-sign-off immutability.
 *
 * Scenario (dataset='training', so the parallel assignment-wave suite,
 * which sweeps dataset='test' pairs, never sees this fixture): an anchor
 * (chief coder) and an enumerator
 * share one video with full provenance (school 88888, arm) so any leak
 * would be visible. The enumerator's justifications and note carry
 * sentinels. What must hold:
 *
 *  - Nobody reaches partner data before BOTH observations are submitted
 *    AND both coders have been live in the room at the same time.
 *  - A coder alone in the lobby gets no partner data — that is the exact
 *    §2 rule ("…opened by both parties").
 *  - Once open, partner payloads carry scores/justifications/note, with
 *    the note sanitized (scripts and handlers stripped).
 *  - Consensus per item: resolution computed server-side, rationale
 *    mandatory whenever anyone moved, encoding always the fixed triple.
 *  - Sign-off needs all 8 items; the second signature completes session,
 *    assignment and video; after that the record is immutable, in the
 *    application AND in the database (migration 0005 trigger).
 *  - No calibration payload ever contains school / arm / raw filename /
 *    gold flag, by key or value.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  assignmentRaters,
  assignments,
  calibrationItems,
  calibrationPresence,
  calibrationSessions,
  pairMembers,
  pairs,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";
import {
  ensureObservation,
  saveNote,
  saveScore,
  submitObservation,
} from "@/lib/db/coder";
import { GET as queueRoute } from "@/app/api/coder/calibration/route";
import { GET as roomRoute } from "@/app/api/coder/calibration/[videoId]/route";
import { POST as joinRoute } from "@/app/api/coder/calibration/[videoId]/join/route";
import { PUT as itemsRoute } from "@/app/api/coder/calibration/[videoId]/items/route";
import { POST as signoffRoute } from "@/app/api/coder/calibration/[videoId]/signoff/route";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: ["V-TEST-CALIB"],
  emails: [
    "calibtest-anchor@example.org",
    "calibtest-enum@example.org",
    "calibtest-out@example.org",
  ],
  pairLabels: ["calibtest-pair"],
};

const mockedAuth = vi.mocked(auth);

const SENTINEL_JUST = "SENTINEL-ENUM-JUSTIFICATION-90210";
const SENTINEL_NOTE = "SENTINEL-ENUM-NOTE-90210";

/** Anchor scores item n; enumerator differs on 2 (3), 4 (2) and agrees
 *  elsewhere; on 6 both said 2 (the consensus will land on a third value). */
const ANCHOR_SCORES = [1, 2, 3, 4, 1, 2, 3, 4];
const ENUM_SCORES = [1, 3, 3, 2, 1, 2, 3, 4];

let anchorId = "";
let enumId = "";
let outsiderId = "";
let videoId = "";
let assignmentId = "";

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({
    user: { id: userId, datasetScope: "live" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

const params = () => ({ params: Promise.resolve({ videoId }) });

async function join(userId: string) {
  actAs(userId);
  return joinRoute(new Request("http://test/join", { method: "POST" }), params());
}

async function room(userId: string) {
  actAs(userId);
  return roomRoute(new Request("http://test/room"), params());
}

async function putItem(
  userId: string,
  body: { itemNo: number; finalScoreNum: number; rationale?: string | null },
) {
  actAs(userId);
  return itemsRoute(
    new Request("http://test/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params(),
  );
}

async function sign(userId: string) {
  actAs(userId);
  return signoffRoute(
    new Request("http://test/signoff", {
      method: "POST",
      headers: { "user-agent": "vitest", "x-forwarded-for": "203.0.113.5" },
    }),
    params(),
  );
}

/** Nothing blinded, by key or value (same discipline as blinding.test.ts). */
function expectBlinded(payload: unknown) {
  const text = JSON.stringify(payload);
  for (const key of [
    '"sid"',
    '"trId"',
    '"tr_id"',
    '"arm"',
    '"school"',
    '"schoolId"',
    '"isGold"',
    '"is_gold"',
    '"rawFilename"',
    '"raw_filename"',
  ]) {
    expect(text).not.toContain(key);
  }
  expect(text).not.toContain("88888"); // the fixture school id
  expect(text).not.toContain("_comp.mp4"); // raw filename pattern
}

beforeAll(async () => {
  await purgeFixture(FIXTURE);

  const [anchor] = await db
    .insert(users)
    .values({
      email: "calibtest-anchor@example.org",
      name: "Calib Anchor",
      role: "coder",
      isChiefCoder: true,
    })
    .returning({ id: users.id });
  const [enumerator] = await db
    .insert(users)
    .values({
      email: "calibtest-enum@example.org",
      name: "Calib Enumerator",
      role: "coder",
    })
    .returning({ id: users.id });
  const [outsider] = await db
    .insert(users)
    .values({ email: "calibtest-out@example.org", role: "coder" })
    .returning({ id: users.id });
  anchorId = anchor.id;
  enumId = enumerator.id;
  outsiderId = outsider.id;

  const [pair] = await db
    .insert(pairs)
    .values({ label: "calibtest-pair", dataset: "training" })
    .returning({ id: pairs.id });
  await db.insert(pairMembers).values([
    { pairId: pair.id, userId: anchorId },
    { pairId: pair.id, userId: enumId },
  ]);

  const [video] = await db
    .insert(videos)
    .values({
      displayCode: "V-TEST-CALIB",
      dataset: "training",
      status: "assigned",
      driveUrl: "https://drive.example/calib",
    })
    .returning({ id: videos.id });
  videoId = video.id;
  await db.insert(videoProvenance).values({
    videoId,
    rawFilename: "88888_88888_9_11_EAST_PHYSICS_comp.mp4",
    sid: "88888",
    trId: "88888_9",
    arm: "connected",
  });

  const [assignment] = await db
    .insert(assignments)
    .values({ videoId, pairId: pair.id, waveNo: 1, dataset: "training" })
    .returning({ id: assignments.id });
  assignmentId = assignment.id;
  await db.insert(assignmentRaters).values([
    { assignmentId, userId: anchorId, fillsContextCard: true },
    { assignmentId, userId: enumId },
  ]);
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("the co-presence gate (CLAUDE.md §2)", () => {
  it("refuses to open calibration before the coder's own submission", async () => {
    const res = await join(anchorId);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/your own scores/i);
  });

  it("refuses while the partner has not submitted", async () => {
    await ensureObservation(anchorId, videoId);
    for (let i = 1; i <= 8; i++) {
      await saveScore(anchorId, videoId, {
        itemNo: i,
        scoreNum: ANCHOR_SCORES[i - 1],
        justification: `anchor item ${i}`,
      });
    }
    await saveNote(anchorId, videoId, { body: "<p>anchor note</p>" });
    await submitObservation(anchorId, videoId);

    const res = await join(anchorId);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/partner has not submitted/i);
  });

  it("releases NOTHING to a coder alone in the lobby, even with both submitted", async () => {
    // Enumerator submits too — with sentinels and a hostile note.
    await ensureObservation(enumId, videoId);
    for (let i = 1; i <= 8; i++) {
      await saveScore(enumId, videoId, {
        itemNo: i,
        scoreNum: ENUM_SCORES[i - 1],
        justification: `${SENTINEL_JUST} item ${i}`,
      });
    }
    await saveNote(enumId, videoId, {
      body: `<h2 style="font-size:26px;line-height:1.25;font-weight:600;margin:0.6em 0 0.4em">Head</h2><script>alert("${SENTINEL_NOTE}-xss")</script><p onclick="steal()">${SENTINEL_NOTE} <mark data-color="#F5E9B8" style="background-color: #F5E9B8">hi</mark></p><img src=x onerror=alert(1)>`,
    });
    await submitObservation(enumId, videoId);

    // The anchor joins ALONE. Session exists (lobby) — no partner data.
    const res = await join(anchorId);
    expect(res.status).toBe(200);
    const state = await res.json();
    expect(["lobby", "scheduled"]).toContain(state.sessionStatus);
    expect(state.partnerScores).toBeNull();
    expect(state.partnerNoteHtml).toBeNull();
    expect(JSON.stringify(state)).not.toContain(SENTINEL_JUST);
    expect(JSON.stringify(state)).not.toContain(SENTINEL_NOTE);
    expectBlinded(state);
  });

  it("stays shut when the partner's presence is stale, and 404s outsiders", async () => {
    // Make the anchor's presence stale, then have the enumerator join alone:
    // one live + one stale is NOT co-presence.
    await db
      .update(calibrationPresence)
      .set({ lastSeenAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(calibrationPresence.userId, anchorId));
    const res = await join(enumId);
    const state = await res.json();
    expect(state.sessionStatus).toBe("lobby");
    expect(state.partnerScores).toBeNull();

    const outsider = await room(outsiderId);
    expect(outsider.status).toBe(404);
    actAs(outsiderId);
    expect((await join(outsiderId)).status).toBe(404);
  });

  it("opens on true co-presence and only then releases partner data — sanitized", async () => {
    await join(enumId); // enumerator is (still) live
    const res = await join(anchorId); // now both are
    expect(res.status).toBe(200);
    const state = await res.json();
    expect(state.sessionStatus).toBe("open");
    expect(state.partnerPresent).toBe(true);

    // Partner data is present…
    expect(state.partnerScores).toHaveLength(8);
    expect(state.partnerScores[1].scoreNum).toBe(ENUM_SCORES[1]);
    expect(state.partnerScores[0].justification).toContain(SENTINEL_JUST);
    // …with the full stored triple, never re-derived.
    expect(state.partnerScores[0]).toMatchObject({
      scoreNum: 1,
      scoreColumn: "A",
      scoreDegree: "very",
    });
    // The note is there but sanitized: content kept, script/handlers gone.
    expect(state.partnerNoteHtml).toContain(SENTINEL_NOTE);
    expect(state.partnerNoteHtml).toContain("<mark");
    expect(state.partnerNoteHtml).not.toContain("<script");
    expect(state.partnerNoteHtml).not.toContain("onclick");
    expect(state.partnerNoteHtml).not.toContain("<img");
    expectBlinded(state);
  });

  it("stays open once opened, even if the partner drops", async () => {
    await db
      .update(calibrationPresence)
      .set({ lastSeenAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(calibrationPresence.userId, enumId));
    const res = await room(anchorId);
    const state = await res.json();
    expect(state.sessionStatus).toBe("open");
    expect(state.partnerPresent).toBe(false);
    expect(state.partnerScores).toHaveLength(8); // release is permanent
  });
});

describe("consensus items", () => {
  it("records simple agreement without a rationale", async () => {
    const res = await putItem(anchorId, { itemNo: 1, finalScoreNum: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ itemNo: 1, resolution: "agreed" });
  });

  it("demands a rationale when the scores differed", async () => {
    const res = await putItem(anchorId, { itemNo: 2, finalScoreNum: 2 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/rationale/i);
  });

  it("computes who moved: partner adopted the anchor's score → b_moved", async () => {
    const res = await putItem(anchorId, {
      itemNo: 2,
      finalScoreNum: 2, // anchor said 2, enumerator said 3
      rationale: "Reviewed the second segment together.",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).resolution).toBe("b_moved");
  });

  it("computes a_moved and both_moved (including a third value both agreed on)", async () => {
    const r4 = await putItem(enumId, {
      itemNo: 4,
      finalScoreNum: 2, // anchor 4, enumerator 2 → anchor moved
      rationale: "The anchor reconsidered.",
    });
    expect((await r4.json()).resolution).toBe("a_moved");

    const r6 = await putItem(anchorId, {
      itemNo: 6,
      finalScoreNum: 3, // both had 2; they land on 3 together
      rationale: "Both moved after re-reading the reach band.",
    });
    expect((await r6.json()).resolution).toBe("both_moved");
  });

  it("rejects illegal scores and item numbers", async () => {
    expect((await putItem(anchorId, { itemNo: 3, finalScoreNum: 5 })).status).toBe(400);
    expect((await putItem(anchorId, { itemNo: 9, finalScoreNum: 1 })).status).toBe(400);
  });
});

describe("sign-off and immutability", () => {
  it("refuses to sign before all 8 items have consensus", async () => {
    const res = await sign(anchorId);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/still needed/i);
  });

  it("completes on the second signature and marks assignment + video", async () => {
    for (const itemNo of [3, 5, 7, 8]) {
      const res = await putItem(anchorId, {
        itemNo,
        finalScoreNum: ANCHOR_SCORES[itemNo - 1],
      });
      expect(res.status).toBe(200);
    }

    const first = await sign(anchorId);
    expect(first.status).toBe(200);
    expect((await first.json()).completed).toBe(false);

    const again = await sign(anchorId);
    expect(again.status).toBe(409);

    const second = await sign(enumId);
    expect(second.status).toBe(200);
    expect((await second.json()).completed).toBe(true);

    const state = await (await room(anchorId)).json();
    expect(state.sessionStatus).toBe("completed");
    expect(state.mySignedAt).toBeTruthy();
    expect(state.partnerSignedAt).toBeTruthy();

    const [assn] = await db
      .select({ status: assignments.status })
      .from(assignments)
      .where(eq(assignments.id, assignmentId));
    expect(assn.status).toBe("completed");
    const [vid] = await db
      .select({ status: videos.status })
      .from(videos)
      .where(eq(videos.id, videoId));
    expect(vid.status).toBe("complete");
  });

  it("refuses further consensus edits through the API", async () => {
    const res = await putItem(anchorId, {
      itemNo: 1,
      finalScoreNum: 2,
      rationale: "should not work",
    });
    expect(res.status).toBe(409);
  });

  it("the DATABASE refuses updates to completed items, even from the admin role", async () => {
    const [session] = await db
      .select({ id: calibrationSessions.id })
      .from(calibrationSessions)
      .where(eq(calibrationSessions.videoId, videoId));
    // Drizzle wraps the pg error; the trigger's message is on the cause.
    await expect(
      db
        .update(calibrationItems)
        .set({ finalScoreNum: 2, finalScoreColumn: "A", finalScoreDegree: "somewhat" })
        .where(
          and(
            eq(calibrationItems.sessionId, session.id),
            eq(calibrationItems.itemNo, 1),
          ),
        ),
    ).rejects.toSatisfy((e: unknown) => {
      const err = e as Error & { cause?: Error };
      return /completed session/i.test(`${err.message} ${err.cause?.message ?? ""}`);
    });
  });

  it("shows the video as calibrated in the queue", async () => {
    actAs(anchorId);
    const res = await queueRoute();
    const { queue } = await res.json();
    const row = queue.find((q: { videoId: string }) => q.videoId === videoId);
    expect(row).toMatchObject({ stage: "completed", displayCode: "V-TEST-CALIB" });
    expectBlinded(queue);
  });
});
