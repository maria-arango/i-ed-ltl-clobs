/**
 * CALIBRATION query layer — part of the restricted coder gate (see
 * lib/db/coder.ts). This module is THE ONLY place partner data is ever
 * released to a coder, and only after the co-presence gate:
 *
 *   CLAUDE.md §2 — a coder must never obtain another coder's scores or
 *   justifications for a shared video "before that pair's calibration
 *   session for that video has been opened by both parties".
 *
 * Mechanics, in the order the tests exercise them:
 *   1. A session is created (status 'lobby') only when BOTH individual
 *      observations are submitted — scores are locked at that point
 *      (CLAUDE.md §6), so nothing seen in the room can change what was
 *      submitted.
 *   2. Joining writes a presence row with a heartbeat. When both coders
 *      are live at once, the session flips to 'open'. Only that flip
 *      releases partner data; it is permanent (the wording of §2), so a
 *      dropped connection mid-meeting never re-hides a discussion the
 *      pair is already having.
 *   3. Consensus per item is mandatory, with a rationale wherever the
 *      final differs from anyone's individual score (Amendment B §3);
 *      the score triple is constructed write-time from lib/score.ts.
 *   4. Both coders sign off; the second signature completes the session,
 *      the assignment and the video. Completed calibration records are
 *      immutable at the database level (migration 0005 triggers).
 *
 * Partner note HTML is sanitized server-side here (lib/sanitize-note.ts)
 * before it ever reaches a response payload.
 */
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  assignmentRaters,
  assignments,
  calibrationItems,
  calibrationPresence,
  calibrationSessions,
  calibrationSignoffs,
  events,
  notes,
  observations,
  pairMembers,
  scores,
  users,
  videos,
} from "@/db/schema";
import { tripleFromNum } from "@/lib/score";
import { sanitizeNoteHtml } from "@/lib/sanitize-note";
import { CoderError, coderDb, type Dataset } from "@/lib/db/coder";

/** A presence heartbeat older than this no longer counts as "in the room". */
export const PRESENCE_TTL_MS = 25_000;

/* ------------------------------------------------------------------ */
/* Shared lookups                                                      */
/* ------------------------------------------------------------------ */

interface PairContext {
  assignmentId: string;
  assignmentStatus: string;
  pairId: string;
  dataset: Dataset;
  videoId: string;
  displayCode: string;
  partnerId: string;
  partnerName: string | null;
}

/**
 * The coder's assignment context for one video, including who the partner
 * is. Missing/inactive assignment → 404, indistinguishable from a video
 * that does not exist (same rule as the workspace).
 */
async function getPairContext(
  coderId: string,
  videoId: string,
): Promise<PairContext> {
  const rows = await coderDb
    .select({
      assignmentId: assignments.id,
      assignmentStatus: assignments.status,
      pairId: assignments.pairId,
      dataset: assignments.dataset,
      videoId: videos.id,
      displayCode: videos.displayCode,
    })
    .from(assignmentRaters)
    .innerJoin(assignments, eq(assignments.id, assignmentRaters.assignmentId))
    .innerJoin(videos, eq(videos.id, assignments.videoId))
    .where(
      and(
        eq(assignmentRaters.userId, coderId),
        eq(assignmentRaters.status, "active"),
        inArray(assignments.status, ["active", "completed"]),
        eq(videos.id, videoId),
      ),
    )
    .limit(1);
  const ctx = rows[0];
  if (!ctx) throw new CoderError("Not found", 404);

  const partnerRows = await coderDb
    .select({ userId: assignmentRaters.userId, name: users.name, email: users.email })
    .from(assignmentRaters)
    .innerJoin(users, eq(users.id, assignmentRaters.userId))
    .where(
      and(
        eq(assignmentRaters.assignmentId, ctx.assignmentId),
        eq(assignmentRaters.status, "active"),
        ne(assignmentRaters.userId, coderId),
      ),
    )
    .limit(1);
  const partner = partnerRows[0];
  if (!partner) {
    throw new CoderError("This video has no second coder yet", 409);
  }

  return {
    ...ctx,
    dataset: ctx.dataset as Dataset,
    partnerId: partner.userId,
    partnerName: partner.name ?? partner.email,
  };
}

async function getSubmittedObservation(coderId: string, videoId: string) {
  const rows = await coderDb
    .select({
      id: observations.id,
      status: observations.status,
      rubricVersionId: observations.rubricVersionId,
    })
    .from(observations)
    .where(
      and(eq(observations.videoId, videoId), eq(observations.coderId, coderId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function findSession(videoId: string, pairId: string) {
  const rows = await coderDb
    .select({
      id: calibrationSessions.id,
      status: calibrationSessions.status,
      dataset: calibrationSessions.dataset,
      completedAt: calibrationSessions.completedAt,
    })
    .from(calibrationSessions)
    .where(
      and(
        eq(calibrationSessions.videoId, videoId),
        eq(calibrationSessions.pairId, pairId),
        ne(calibrationSessions.status, "voided"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function logEvent(
  coderId: string,
  dataset: Dataset,
  kind: string,
  refs: { videoId?: string; sessionId?: string },
  payload?: Record<string, unknown>,
) {
  await coderDb.insert(events).values({
    userId: coderId,
    dataset,
    kind,
    videoId: refs.videoId ?? null,
    sessionId: refs.sessionId ?? null,
    payload: payload ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

export type CalibrationStage =
  | "code_first" // my own observation is not submitted yet
  | "waiting_partner" // mine is in, partner's is not
  | "ready" // both submitted, calibration not finished
  | "completed";

export interface CalibrationQueueRow {
  videoId: string;
  displayCode: string;
  partnerName: string | null;
  stage: CalibrationStage;
  sessionStatus: string | null;
  completedAt: Date | null;
}

/** Every shared video of this coder with its calibration stage. */
export async function getCalibrationQueue(
  coderId: string,
): Promise<CalibrationQueueRow[]> {
  const mine = await coderDb
    .select({
      assignmentId: assignments.id,
      videoId: videos.id,
      displayCode: videos.displayCode,
      pairId: assignments.pairId,
    })
    .from(assignmentRaters)
    .innerJoin(assignments, eq(assignments.id, assignmentRaters.assignmentId))
    .innerJoin(videos, eq(videos.id, assignments.videoId))
    .where(
      and(
        eq(assignmentRaters.userId, coderId),
        eq(assignmentRaters.status, "active"),
        inArray(assignments.status, ["active", "completed"]),
      ),
    );
  if (mine.length === 0) return [];

  const assignmentIds = mine.map((m) => m.assignmentId);
  const videoIds = mine.map((m) => m.videoId);

  const partners = await coderDb
    .select({
      assignmentId: assignmentRaters.assignmentId,
      userId: assignmentRaters.userId,
      name: users.name,
      email: users.email,
    })
    .from(assignmentRaters)
    .innerJoin(users, eq(users.id, assignmentRaters.userId))
    .where(
      and(
        inArray(assignmentRaters.assignmentId, assignmentIds),
        eq(assignmentRaters.status, "active"),
        ne(assignmentRaters.userId, coderId),
      ),
    );

  const relevantUserIds = [coderId, ...partners.map((p) => p.userId)];
  const obs = await coderDb
    .select({
      videoId: observations.videoId,
      coderId: observations.coderId,
      status: observations.status,
    })
    .from(observations)
    .where(
      and(
        inArray(observations.videoId, videoIds),
        inArray(observations.coderId, relevantUserIds),
      ),
    );

  const sessions = await coderDb
    .select({
      videoId: calibrationSessions.videoId,
      pairId: calibrationSessions.pairId,
      status: calibrationSessions.status,
      completedAt: calibrationSessions.completedAt,
    })
    .from(calibrationSessions)
    .where(
      and(
        inArray(calibrationSessions.videoId, videoIds),
        ne(calibrationSessions.status, "voided"),
      ),
    );

  return mine.map((m) => {
    const partner = partners.find((p) => p.assignmentId === m.assignmentId);
    const myObs = obs.find(
      (o) => o.videoId === m.videoId && o.coderId === coderId,
    );
    const partnerObs = partner
      ? obs.find(
          (o) => o.videoId === m.videoId && o.coderId === partner.userId,
        )
      : undefined;
    const session = sessions.find(
      (s) => s.videoId === m.videoId && s.pairId === m.pairId,
    );

    let stage: CalibrationStage;
    if (session?.status === "completed") stage = "completed";
    else if (myObs?.status !== "submitted") stage = "code_first";
    else if (partnerObs?.status !== "submitted") stage = "waiting_partner";
    else stage = "ready";

    return {
      videoId: m.videoId,
      displayCode: m.displayCode,
      partnerName: partner ? (partner.name ?? partner.email) : null,
      stage,
      sessionStatus: session?.status ?? null,
      completedAt: session?.completedAt ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Room state (the release gate lives HERE and nowhere else)           */
/* ------------------------------------------------------------------ */

export interface ScoreView {
  itemNo: number;
  scoreNum: number;
  scoreColumn: string;
  scoreDegree: string;
  justification: string | null;
}

export interface RoomState {
  videoId: string;
  displayCode: string;
  partnerName: string | null;
  /** 'none' = both submitted their scores but nobody joined yet. */
  sessionStatus: "none" | "scheduled" | "lobby" | "open" | "completed";
  partnerPresent: boolean;
  myScores: ScoreView[];
  myNoteHtml: string | null;
  /** null until the session has been opened by both parties. */
  partnerScores: ScoreView[] | null;
  partnerNoteHtml: string | null;
  items: Array<{
    itemNo: number;
    finalScoreNum: number;
    finalScoreColumn: string;
    finalScoreDegree: string;
    resolution: string;
    consensusRationale: string | null;
  }>;
  mySignedAt: Date | null;
  partnerSignedAt: Date | null;
  completedAt: Date | null;
}

async function getScoresView(
  coderId: string,
  videoId: string,
): Promise<ScoreView[]> {
  const obs = await getSubmittedObservation(coderId, videoId);
  if (!obs) return [];
  return coderDb
    .select({
      itemNo: scores.itemNo,
      scoreNum: scores.scoreNum,
      scoreColumn: scores.scoreColumn,
      scoreDegree: scores.scoreDegree,
      justification: scores.justification,
    })
    .from(scores)
    .where(eq(scores.observationId, obs.id))
    .orderBy(scores.itemNo);
}

async function getNoteHtml(
  coderId: string,
  videoId: string,
): Promise<string | null> {
  const obs = await getSubmittedObservation(coderId, videoId);
  if (!obs) return null;
  const rows = await coderDb
    .select({ body: notes.body })
    .from(notes)
    .where(and(eq(notes.observationId, obs.id), isNull(notes.deletedAt)))
    .limit(1);
  return rows[0] ? sanitizeNoteHtml(rows[0].body) : null;
}

export async function getCalibrationRoom(
  coderId: string,
  videoId: string,
): Promise<RoomState> {
  const ctx = await getPairContext(coderId, videoId);
  const session = await findSession(videoId, ctx.pairId);

  const myScores = await getScoresView(coderId, videoId);
  const myNoteHtml = await getNoteHtml(coderId, videoId);

  let partnerPresent = false;
  let items: RoomState["items"] = [];
  let mySignedAt: Date | null = null;
  let partnerSignedAt: Date | null = null;

  if (session) {
    const presence = await coderDb
      .select({
        userId: calibrationPresence.userId,
        lastSeenAt: calibrationPresence.lastSeenAt,
        leftAt: calibrationPresence.leftAt,
      })
      .from(calibrationPresence)
      .where(eq(calibrationPresence.sessionId, session.id));
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    partnerPresent = presence.some(
      (p) =>
        p.userId === ctx.partnerId &&
        p.leftAt === null &&
        p.lastSeenAt.getTime() > cutoff,
    );

    items = await coderDb
      .select({
        itemNo: calibrationItems.itemNo,
        finalScoreNum: calibrationItems.finalScoreNum,
        finalScoreColumn: calibrationItems.finalScoreColumn,
        finalScoreDegree: calibrationItems.finalScoreDegree,
        resolution: calibrationItems.resolution,
        consensusRationale: calibrationItems.consensusRationale,
      })
      .from(calibrationItems)
      .where(eq(calibrationItems.sessionId, session.id))
      .orderBy(calibrationItems.itemNo);

    const signoffs = await coderDb
      .select({
        userId: calibrationSignoffs.userId,
        signedAt: calibrationSignoffs.signedAt,
      })
      .from(calibrationSignoffs)
      .where(eq(calibrationSignoffs.sessionId, session.id));
    mySignedAt = signoffs.find((s) => s.userId === coderId)?.signedAt ?? null;
    partnerSignedAt =
      signoffs.find((s) => s.userId === ctx.partnerId)?.signedAt ?? null;
  }

  // THE GATE. Partner data leaves the database only past this line, and
  // only for a session that both parties have opened ('open'/'completed').
  const released =
    session !== null &&
    (session.status === "open" || session.status === "completed");

  const partnerScores = released
    ? await getScoresView(ctx.partnerId, videoId)
    : null;
  const partnerNoteHtml = released
    ? await getNoteHtml(ctx.partnerId, videoId)
    : null;

  return {
    videoId,
    displayCode: ctx.displayCode,
    partnerName: ctx.partnerName,
    sessionStatus: (session?.status ?? "none") as RoomState["sessionStatus"],
    partnerPresent,
    myScores,
    myNoteHtml,
    partnerScores,
    partnerNoteHtml,
    items,
    mySignedAt,
    partnerSignedAt,
    completedAt: session?.completedAt ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Join / heartbeat / leave                                            */
/* ------------------------------------------------------------------ */

/**
 * Join the calibration room for a video (also the heartbeat — the client
 * calls it every few seconds while the page is open). Creates the session
 * when both observations are submitted, refreshes presence, and flips the
 * session to 'open' the first time both coders are live at once.
 */
export async function joinCalibration(
  coderId: string,
  videoId: string,
): Promise<RoomState> {
  const ctx = await getPairContext(coderId, videoId);

  const myObs = await getSubmittedObservation(coderId, videoId);
  if (myObs?.status !== "submitted") {
    throw new CoderError(
      "Submit your own scores before opening calibration",
      409,
    );
  }
  const partnerObs = await getSubmittedObservation(ctx.partnerId, videoId);
  if (partnerObs?.status !== "submitted") {
    throw new CoderError("Your partner has not submitted their scores yet", 409);
  }

  let session = await findSession(videoId, ctx.pairId);
  if (!session) {
    // Two coders may create simultaneously; the partial unique index makes
    // one of them lose, so re-select after a swallowed conflict.
    await coderDb
      .insert(calibrationSessions)
      .values({
        videoId,
        pairId: ctx.pairId,
        dataset: ctx.dataset,
        status: "lobby",
        rubricVersionId: myObs.rubricVersionId,
      })
      .onConflictDoNothing();
    session = await findSession(videoId, ctx.pairId);
    if (!session) throw new CoderError("Could not open a session", 500);
    await logEvent(coderId, ctx.dataset, "calibration_session_created", {
      videoId,
      sessionId: session.id,
    });
  }

  // Presence upsert = heartbeat. Log a join only on fresh arrival.
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  const existing = await coderDb
    .select({
      lastSeenAt: calibrationPresence.lastSeenAt,
      leftAt: calibrationPresence.leftAt,
    })
    .from(calibrationPresence)
    .where(
      and(
        eq(calibrationPresence.sessionId, session.id),
        eq(calibrationPresence.userId, coderId),
      ),
    )
    .limit(1);
  const freshArrival =
    !existing[0] ||
    existing[0].leftAt !== null ||
    existing[0].lastSeenAt.getTime() <= cutoff;

  await coderDb
    .insert(calibrationPresence)
    .values({ sessionId: session.id, userId: coderId })
    .onConflictDoUpdate({
      target: [calibrationPresence.sessionId, calibrationPresence.userId],
      set: { lastSeenAt: new Date(), leftAt: null },
    });
  if (freshArrival) {
    await logEvent(coderId, ctx.dataset, "calibration_joined", {
      videoId,
      sessionId: session.id,
    });
  }

  // Co-presence check: flip to 'open' when both are live.
  if (session.status === "scheduled" || session.status === "lobby") {
    const presence = await coderDb
      .select({
        userId: calibrationPresence.userId,
        lastSeenAt: calibrationPresence.lastSeenAt,
        leftAt: calibrationPresence.leftAt,
      })
      .from(calibrationPresence)
      .where(eq(calibrationPresence.sessionId, session.id));
    const live = (uid: string) =>
      presence.some(
        (p) =>
          p.userId === uid && p.leftAt === null && p.lastSeenAt.getTime() > cutoff,
      );
    if (live(coderId) && live(ctx.partnerId)) {
      await coderDb
        .update(calibrationSessions)
        .set({ status: "open" })
        .where(
          and(
            eq(calibrationSessions.id, session.id),
            inArray(calibrationSessions.status, ["scheduled", "lobby"]),
          ),
        );
      await logEvent(coderId, ctx.dataset, "calibration_opened", {
        videoId,
        sessionId: session.id,
      });
    }
  }

  return getCalibrationRoom(coderId, videoId);
}

/** Mark the coder as having left the room (client fires it on unload). */
export async function leaveCalibration(coderId: string, videoId: string) {
  const ctx = await getPairContext(coderId, videoId);
  const session = await findSession(videoId, ctx.pairId);
  if (!session) return;
  await coderDb
    .update(calibrationPresence)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(calibrationPresence.sessionId, session.id),
        eq(calibrationPresence.userId, coderId),
        isNull(calibrationPresence.leftAt),
      ),
    );
  await logEvent(coderId, ctx.dataset, "calibration_left", {
    videoId,
    sessionId: session.id,
  });
}

/* ------------------------------------------------------------------ */
/* Consensus + sign-off                                                */
/* ------------------------------------------------------------------ */

/** Which pair member is coder "A" in calibration_items: the anchor. */
async function getAnchorId(pairId: string): Promise<string> {
  const members = await coderDb
    .select({
      userId: pairMembers.userId,
      role: users.role,
      isChiefCoder: users.isChiefCoder,
    })
    .from(pairMembers)
    .innerJoin(users, eq(users.id, pairMembers.userId))
    .where(and(eq(pairMembers.pairId, pairId), isNull(pairMembers.leftAt)));
  const anchor = members.find((m) => m.role === "admin" || m.isChiefCoder);
  if (!anchor) throw new CoderError("This pair has no anchor", 500);
  return anchor.userId;
}

async function requireOpenSession(coderId: string, videoId: string) {
  const ctx = await getPairContext(coderId, videoId);
  const session = await findSession(videoId, ctx.pairId);
  if (!session || (session.status !== "open" && session.status !== "completed")) {
    throw new CoderError(
      "The calibration session is not open — both of you need to be in the room",
      409,
    );
  }
  return { ctx, session };
}

/**
 * Save (or revise, before sign-off) the consensus for one item. The
 * resolution is computed here from the two locked individual scores;
 * a rationale is required whenever the final is not simply the score
 * both coders already agreed on.
 */
export async function saveConsensusItem(
  coderId: string,
  videoId: string,
  input: { itemNo: number; finalScoreNum: number; rationale: string | null },
) {
  if (!Number.isInteger(input.itemNo) || input.itemNo < 1 || input.itemNo > 8) {
    throw new CoderError("itemNo must be 1–8", 400);
  }
  let triple: ReturnType<typeof tripleFromNum>;
  try {
    triple = tripleFromNum(input.finalScoreNum);
  } catch {
    throw new CoderError("finalScoreNum must be 1–4", 400);
  }
  const { ctx, session } = await requireOpenSession(coderId, videoId);
  if (session.status === "completed") {
    throw new CoderError("This calibration is signed and immutable", 409);
  }

  // In calibration_items, coder A is always the anchor and coder B the
  // enumerator, so exports read consistently.
  const anchorId = await getAnchorId(ctx.pairId);
  const bCoderId = coderId === anchorId ? ctx.partnerId : coderId;

  const scoreRowFor = async (uid: string) => {
    const obs = await getSubmittedObservation(uid, videoId);
    if (!obs) throw new CoderError("Individual scores are missing", 409);
    const rows = await coderDb
      .select({ id: scores.id, scoreNum: scores.scoreNum })
      .from(scores)
      .where(
        and(eq(scores.observationId, obs.id), eq(scores.itemNo, input.itemNo)),
      )
      .limit(1);
    if (!rows[0]) throw new CoderError("Individual scores are missing", 409);
    return rows[0];
  };
  const aScore = await scoreRowFor(anchorId);
  const bScore = await scoreRowFor(bCoderId);

  const f = triple.scoreNum;
  const resolution =
    aScore.scoreNum === f && bScore.scoreNum === f
      ? "agreed"
      : aScore.scoreNum === f
        ? "b_moved"
        : bScore.scoreNum === f
          ? "a_moved"
          : "both_moved";

  const rationale = input.rationale?.trim() || null;
  if (resolution !== "agreed" && !rationale) {
    throw new CoderError(
      "Please record a short consensus rationale — the scores differed",
      400,
    );
  }

  await coderDb
    .insert(calibrationItems)
    .values({
      sessionId: session.id,
      itemNo: input.itemNo,
      coderAScoreId: aScore.id,
      coderBScoreId: bScore.id,
      finalScoreNum: triple.scoreNum,
      finalScoreColumn: triple.scoreColumn,
      finalScoreDegree: triple.scoreDegree,
      resolution,
      consensusRationale: rationale,
      dataset: ctx.dataset,
    })
    .onConflictDoUpdate({
      target: [calibrationItems.sessionId, calibrationItems.itemNo],
      set: {
        finalScoreNum: triple.scoreNum,
        finalScoreColumn: triple.scoreColumn,
        finalScoreDegree: triple.scoreDegree,
        resolution,
        consensusRationale: rationale,
      },
    });

  await logEvent(coderId, ctx.dataset, "consensus_saved", {
    videoId,
    sessionId: session.id,
  }, { itemNo: input.itemNo, resolution });

  return { itemNo: input.itemNo, resolution };
}

/**
 * Sign the calibration. Requires all 8 consensus items. The second
 * signature completes the session, the assignment and the video —
 * after that, migration 0005's triggers make the record immutable.
 */
export async function signOffCalibration(
  coderId: string,
  videoId: string,
  meta: { ipAddress: string | null; userAgent: string | null },
) {
  const { ctx, session } = await requireOpenSession(coderId, videoId);
  if (session.status === "completed") {
    throw new CoderError("Already completed", 409);
  }

  const items = await coderDb
    .select({ itemNo: calibrationItems.itemNo })
    .from(calibrationItems)
    .where(eq(calibrationItems.sessionId, session.id));
  const missing = [1, 2, 3, 4, 5, 6, 7, 8].filter(
    (n) => !items.some((i) => i.itemNo === n),
  );
  if (missing.length > 0) {
    throw new CoderError(
      `Consensus still needed on item${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`,
      400,
    );
  }

  try {
    await coderDb.insert(calibrationSignoffs).values({
      sessionId: session.id,
      userId: coderId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  } catch (e) {
    // Drizzle wraps the pg error; the constraint name is on the cause.
    const detail =
      e instanceof Error
        ? `${e.message} ${e.cause instanceof Error ? e.cause.message : ""}`
        : "";
    if (/one_signoff_per_user_per_session|duplicate key/.test(detail)) {
      throw new CoderError("You have already signed", 409);
    }
    console.error("signoff insert failed:", detail);
    throw e;
  }
  await logEvent(coderId, ctx.dataset, "calibration_signed", {
    videoId,
    sessionId: session.id,
  });

  const signoffs = await coderDb
    .select({ userId: calibrationSignoffs.userId })
    .from(calibrationSignoffs)
    .where(eq(calibrationSignoffs.sessionId, session.id));
  const bothSigned =
    signoffs.some((s) => s.userId === coderId) &&
    signoffs.some((s) => s.userId === ctx.partnerId);

  if (bothSigned) {
    const now = new Date();
    await coderDb
      .update(calibrationSessions)
      .set({ status: "completed", completedAt: now })
      .where(
        and(
          eq(calibrationSessions.id, session.id),
          eq(calibrationSessions.status, "open"),
        ),
      );
    await coderDb
      .update(assignments)
      .set({ status: "completed" })
      .where(
        and(
          eq(assignments.id, ctx.assignmentId),
          eq(assignments.status, "active"),
        ),
      );
    await coderDb
      .update(videos)
      .set({ status: "complete" })
      .where(eq(videos.id, videoId));
    await logEvent(coderId, ctx.dataset, "calibration_completed", {
      videoId,
      sessionId: session.id,
    });
  }

  return { completed: bothSigned };
}
