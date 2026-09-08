/**
 * CODER query layer — the ONLY module coder-facing code may use to reach
 * the database (docs/03-data-model.md §3).
 *
 * - Connects as the restricted role `clobs_coder` (DATABASE_URL_CODER),
 *   which has no grant on video_provenance, gold_scores, assignment_log,
 *   audit_log or exports, and can read only named columns of `videos`
 *   (is_gold is not among them). A bug here returns a Postgres permission
 *   error, not data.
 * - Every query is scoped to the acting coder's id. Nothing here returns
 *   another coder's scores, justifications or notes; the calibration layer
 *   (Stage 3) is the only place partner data will ever be released, after
 *   its co-presence gate.
 * - Selects are explicit column lists on purpose: `select *` on `videos`
 *   would be refused by the role, so explicitness is enforced, not hoped.
 *
 * The ESLint boundary rule forbids importing the admin client (`@/lib/db`)
 * anywhere under app/api/coder or app/(coder).
 */
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hardenSslMode } from "@/lib/pg-url";
import {
  assignmentRaters,
  assignments,
  contextAdults,
  contextCards,
  notes,
  observations,
  scores,
  sectionSessions,
  users,
  videoLocks,
  videos,
} from "@/db/schema";
import type { DeviceKind } from "@/lib/device";

const pool = new Pool({
  connectionString: hardenSslMode(process.env.DATABASE_URL_CODER),
  max: 5,
});

const coderDb = drizzle(pool);

/** INTERNAL to lib/db/* — the calibration layer (coder-calibration.ts)
 *  shares this restricted connection. Route handlers must keep using the
 *  exported functions, never this handle. */
export { coderDb };

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

export interface QueueRow {
  videoId: string;
  displayCode: string;
  driveUrl: string | null;
  durationSeconds: number | null;
  videoStatus: string;
  fillsContextCard: boolean;
  observationStatus: string | null;
  submittedAt: Date | null;
  /** Who codes this video with me — released by design: pairs calibrate
   *  together, so knowing WHO the partner is is never a blinding matter
   *  (their scores and notes remain gated by the calibration room). */
  partnerName: string | null;
}

/** The coder's own assigned videos, with their own progress. */
export async function getCoderQueue(coderId: string): Promise<QueueRow[]> {
  const rows = await coderDb
    .select({
      assignmentId: assignments.id,
      videoId: videos.id,
      displayCode: videos.displayCode,
      driveUrl: videos.driveUrl,
      durationSeconds: videos.durationSeconds,
      videoStatus: videos.status,
      fillsContextCard: assignmentRaters.fillsContextCard,
      observationStatus: observations.status,
      submittedAt: observations.submittedAt,
    })
    .from(assignmentRaters)
    .innerJoin(assignments, eq(assignments.id, assignmentRaters.assignmentId))
    .innerJoin(videos, eq(videos.id, assignments.videoId))
    .leftJoin(
      observations,
      and(
        eq(observations.videoId, videos.id),
        eq(observations.coderId, coderId),
      ),
    )
    .where(
      and(
        eq(assignmentRaters.userId, coderId),
        eq(assignmentRaters.status, "active"),
        eq(assignments.status, "active"),
      ),
    )
    .orderBy(asc(videos.displayCode));

  if (rows.length === 0) return [];
  const partnerRows = await coderDb
    .select({
      assignmentId: assignmentRaters.assignmentId,
      name: users.name,
      email: users.email,
    })
    .from(assignmentRaters)
    .innerJoin(users, eq(users.id, assignmentRaters.userId))
    .where(
      and(
        inArray(
          assignmentRaters.assignmentId,
          rows.map((r) => r.assignmentId),
        ),
        eq(assignmentRaters.status, "active"),
        ne(assignmentRaters.userId, coderId),
      ),
    );
  const partnerByAssignment = new Map(
    partnerRows.map((p) => [p.assignmentId, p.name ?? p.email]),
  );
  return rows.map(({ assignmentId, ...row }) => ({
    ...row,
    partnerName: partnerByAssignment.get(assignmentId) ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

export interface CardRecord {
  id: string;
  status: string;
  submittedAt: Date | null;
  subject: string | null;
  composition: string | null;
  approxCount: string | null;
  uniforms: string | null;
  appearanceCaveats: string | null;
  room: string | null;
  camera: string | null;
  notes: string | null;
  timeline: string | null;
  settingChange: string | null;
  adults: Array<{
    id: string;
    adultNo: number;
    role: string | null;
    sex: string | null;
    clothing: string | null;
    clothingCaveats: string | null;
    features: string | null;
    behavior: string | null;
    speaks: string | null;
  }>;
}

/**
 * Amendment §43: every coder fills their OWN card. `mine` is always
 * readable; the partner's card is released only after this coder has
 * submitted their own scores (the Amendment A ordering rule, unchanged).
 */
export interface WorkspaceContextCard {
  mine: CardRecord | null;
  /** True while the partner's card (if any) may not be read yet. */
  partnerLocked: boolean;
  partner: CardRecord | null;
}

export interface Workspace {
  video: {
    id: string;
    displayCode: string;
    driveUrl: string | null;
    durationSeconds: number | null;
    status: string;
  };
  fillsContextCard: boolean;
  observation: {
    id: string;
    status: string;
    startedAt: Date | null;
    submittedAt: Date | null;
  } | null;
  notes: Array<{
    id: string;
    videoTimestampSeconds: number | null;
    body: string;
    updatedAt: Date;
  }>;
  scores: Array<{
    id: string;
    itemNo: number;
    scoreNum: number;
    scoreColumn: string;
    scoreDegree: string;
    justification: string | null;
    submittedAt: Date | null;
  }>;
  contextCard: WorkspaceContextCard;
  /** Amendment §45: "this" when this video holds the coder's lock, "other"
   *  when another video does (then `lockedVideo` says which), null when
   *  nothing is started. */
  lock: { holder: "this" | "other" | null; lockedVideo: { videoId: string; displayCode: string } | null };
  /** Amendment §44: sitting state per gated section. */
  sections: { context_card: SectionState; scores: SectionState };
}

/**
 * Everything the coder may see about ONE of their assigned videos:
 * the video, their own observation, their own notes and scores, and the
 * context card under the Amendment A visibility rule. Returns null when
 * the video is not actively assigned to this coder — the route turns that
 * into a 404, indistinguishable from a video that does not exist.
 */
export async function getWorkspace(
  coderId: string,
  videoId: string,
): Promise<Workspace | null> {
  const assignmentRows = await coderDb
    .select({
      fillsContextCard: assignmentRaters.fillsContextCard,
      videoId: videos.id,
      displayCode: videos.displayCode,
      driveUrl: videos.driveUrl,
      durationSeconds: videos.durationSeconds,
      videoStatus: videos.status,
    })
    .from(assignmentRaters)
    .innerJoin(assignments, eq(assignments.id, assignmentRaters.assignmentId))
    .innerJoin(videos, eq(videos.id, assignments.videoId))
    .where(
      and(
        eq(assignmentRaters.userId, coderId),
        eq(assignmentRaters.status, "active"),
        eq(assignments.status, "active"),
        eq(videos.id, videoId),
      ),
    )
    .limit(1);

  const assigned = assignmentRows[0];
  if (!assigned) return null;

  const observationRows = await coderDb
    .select({
      id: observations.id,
      status: observations.status,
      startedAt: observations.startedAt,
      submittedAt: observations.submittedAt,
    })
    .from(observations)
    .where(
      and(
        eq(observations.videoId, videoId),
        eq(observations.coderId, coderId),
      ),
    )
    .limit(1);
  const observation = observationRows[0] ?? null;

  const myNotes = observation
    ? await coderDb
        .select({
          id: notes.id,
          videoTimestampSeconds: notes.videoTimestampSeconds,
          body: notes.body,
          updatedAt: notes.updatedAt,
        })
        .from(notes)
        .where(
          and(eq(notes.observationId, observation.id), isNull(notes.deletedAt)),
        )
        .orderBy(asc(notes.createdAt))
    : [];

  const myScores = observation
    ? await coderDb
        .select({
          id: scores.id,
          itemNo: scores.itemNo,
          scoreNum: scores.scoreNum,
          scoreColumn: scores.scoreColumn,
          scoreDegree: scores.scoreDegree,
          justification: scores.justification,
          submittedAt: scores.submittedAt,
        })
        .from(scores)
        .where(eq(scores.observationId, observation.id))
        .orderBy(asc(scores.itemNo))
    : [];

  const submitted = observation?.status === "submitted";
  const contextCard = await getContextCardForCoder(coderId, videoId, submitted);

  const activeLock = await getActiveLock(coderId);
  const lock: Workspace["lock"] = activeLock
    ? activeLock.videoId === videoId
      ? { holder: "this", lockedVideo: null }
      : { holder: "other", lockedVideo: { videoId: activeLock.videoId, displayCode: activeLock.displayCode } }
    : { holder: null, lockedVideo: null };

  const sections = {
    context_card: await getSectionState(coderId, videoId, "context_card", contextCard.mine?.status === "submitted"),
    scores: await getSectionState(coderId, videoId, "scores", submitted),
  };

  return {
    video: {
      id: assigned.videoId,
      displayCode: assigned.displayCode,
      driveUrl: assigned.driveUrl,
      durationSeconds: assigned.durationSeconds,
      status: assigned.videoStatus,
    },
    fillsContextCard: assigned.fillsContextCard,
    observation,
    notes: myNotes,
    scores: myScores,
    contextCard,
    lock,
    sections,
  };
}

/**
 * Amendment §43 + Amendment A visibility: this coder's own card is always
 * readable; the partner's only after this coder has submitted their own
 * individual scores (the card describes what the teacher did and would
 * colour a first impression).
 */
async function getContextCardForCoder(
  coderId: string,
  videoId: string,
  hasSubmittedOwnScores: boolean,
): Promise<WorkspaceContextCard> {
  const cardRows = await coderDb
    .select({
      id: contextCards.id,
      authoredBy: contextCards.authoredBy,
      status: contextCards.status,
      submittedAt: contextCards.submittedAt,
      subject: contextCards.subject,
      composition: contextCards.composition,
      approxCount: contextCards.approxCount,
      uniforms: contextCards.uniforms,
      appearanceCaveats: contextCards.appearanceCaveats,
      room: contextCards.room,
      camera: contextCards.camera,
      notes: contextCards.notes,
      timeline: contextCards.timeline,
      settingChange: contextCards.settingChange,
    })
    .from(contextCards)
    .where(eq(contextCards.videoId, videoId));

  const mineRow = cardRows.find((r) => r.authoredBy === coderId) ?? null;
  const partnerRow = cardRows.find((r) => r.authoredBy !== coderId) ?? null;

  const withAdults = async (row: NonNullable<typeof mineRow>): Promise<CardRecord> => {
    const adults = await loadAdults(row.id);
    const { authoredBy: _authoredBy, ...fields } = row;
    return { ...fields, adults };
  };

  const mine = mineRow ? await withAdults(mineRow) : null;
  // Releasing any field of the partner's card — including that it exists —
  // before this coder's own submission would leak observations.
  const partnerLocked = !!partnerRow && !hasSubmittedOwnScores;
  const partner = partnerRow && hasSubmittedOwnScores ? await withAdults(partnerRow) : null;
  return { mine, partnerLocked, partner };
}

async function loadAdults(cardId: string) {
  const adults = await coderDb
    .select({
      id: contextAdults.id,
      adultNo: contextAdults.adultNo,
      role: contextAdults.role,
      sex: contextAdults.sex,
      clothing: contextAdults.clothing,
      clothingCaveats: contextAdults.clothingCaveats,
      features: contextAdults.features,
      behavior: contextAdults.behavior,
      speaks: contextAdults.speaks,
    })
    .from(contextAdults)
    .where(
      and(
        eq(contextAdults.contextCardId, cardId),
        isNull(contextAdults.deletedAt),
      ),
    )
    .orderBy(asc(contextAdults.adultNo));
  return adults;
}

/* ------------------------------------------------------------------ */
/* Rubric (read-only reference data)                                   */
/* ------------------------------------------------------------------ */

import { sql } from "drizzle-orm";
import {
  events,
  fieldHelp,
  rubricAnchors,
  rubricConcepts,
  rubricExamples,
  rubricGuidance,
  rubricIndicators,
  rubricVersions,
} from "@/db/schema";
import { tripleFromNum } from "@/lib/score";

export async function getActiveRubricVersion(): Promise<{
  id: string;
  versionLabel: string;
} | null> {
  const rows = await coderDb
    .select({ id: rubricVersions.id, versionLabel: rubricVersions.versionLabel })
    .from(rubricVersions)
    // NULLS LAST: a version without effective_from is never the active one.
    .orderBy(sql`${rubricVersions.effectiveFrom} DESC NULLS LAST`)
    .limit(1);
  return rows[0] ?? null;
}

export async function getRubricContent() {
  const version = await getActiveRubricVersion();
  if (!version) return null;

  const concepts = await coderDb
    .select({
      id: rubricConcepts.id,
      itemNo: rubricConcepts.itemNo,
      name: rubricConcepts.name,
      statement: rubricConcepts.statement,
      importance: rubricConcepts.importance,
      specialNote: rubricConcepts.specialNote,
    })
    .from(rubricConcepts)
    .where(eq(rubricConcepts.rubricVersionId, version.id))
    .orderBy(asc(rubricConcepts.itemNo));

  const conceptIds = concepts.map((c) => c.id);
  const [indicators, anchors, examples, guidance, help] = await Promise.all([
    coderDb
      .select({
        conceptId: rubricIndicators.conceptId,
        position: rubricIndicators.position,
        text: rubricIndicators.text,
      })
      .from(rubricIndicators)
      .where(inArray(rubricIndicators.conceptId, conceptIds))
      .orderBy(asc(rubricIndicators.position)),
    coderDb
      .select({
        conceptId: rubricAnchors.conceptId,
        scoreNum: rubricAnchors.scoreNum,
        text: rubricAnchors.text,
      })
      .from(rubricAnchors)
      .where(inArray(rubricAnchors.conceptId, conceptIds)),
    coderDb
      .select({
        conceptId: rubricExamples.conceptId,
        scoreNum: rubricExamples.scoreNum,
        position: rubricExamples.position,
        text: rubricExamples.text,
      })
      .from(rubricExamples)
      .where(inArray(rubricExamples.conceptId, conceptIds))
      .orderBy(asc(rubricExamples.position)),
    coderDb
      .select({
        kind: rubricGuidance.kind,
        position: rubricGuidance.position,
        label: rubricGuidance.label,
        text: rubricGuidance.text,
      })
      .from(rubricGuidance)
      .where(eq(rubricGuidance.rubricVersionId, version.id))
      .orderBy(asc(rubricGuidance.position)),
    coderDb
      .select({ fieldKey: fieldHelp.fieldKey, helpText: fieldHelp.helpText })
      .from(fieldHelp)
      .where(and(eq(fieldHelp.form, "context_card"), eq(fieldHelp.active, true))),
  ]);

  return {
    version,
    guidance,
    fieldHelp: Object.fromEntries(help.map((h) => [h.fieldKey, h.helpText])),
    concepts: concepts.map((c) => ({
      itemNo: c.itemNo,
      name: c.name,
      statement: c.statement,
      importance: c.importance,
      specialNote: c.specialNote,
      indicators: indicators.filter((i) => i.conceptId === c.id).map((i) => i.text),
      anchors: Object.fromEntries(
        anchors.filter((a) => a.conceptId === c.id).map((a) => [a.scoreNum, a.text]),
      ) as Record<number, string>,
      examples: [1, 2, 3, 4].map((n) => ({
        scoreNum: n,
        items: examples
          .filter((e) => e.conceptId === c.id && e.scoreNum === n)
          .map((e) => e.text),
      })),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Writes — every write verifies ownership and stamps `dataset` from   */
/* the acting account's scope (server-side, never from the client).    */
/* ------------------------------------------------------------------ */

export type Dataset = "live" | "test" | "training";

// No TS parameter property here on purpose: Node's strip-only TS mode
// (used by the .mts scripts) cannot run that syntax.
class CoderError extends Error {
  status: number;
  /** Machine-readable reason for clients that branch on it. */
  code?: string;
  details?: Record<string, unknown>;
  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export { CoderError };

/**
 * Every write goes through here. Besides ownership it enforces the
 * one-video-at-a-time rule (Amendment §45): while the coder holds an active
 * lock on ANOTHER video, writes to this one are refused with 423.
 */
async function assertAssigned(coderId: string, videoId: string) {
  const rows = await coderDb
    .select({
      fillsContextCard: assignmentRaters.fillsContextCard,
      dataset: assignments.dataset,
    })
    .from(assignmentRaters)
    .innerJoin(assignments, eq(assignments.id, assignmentRaters.assignmentId))
    .where(
      and(
        eq(assignmentRaters.userId, coderId),
        eq(assignmentRaters.status, "active"),
        eq(assignments.status, "active"),
        eq(assignments.videoId, videoId),
      ),
    )
    .limit(1);
  const lock = await getActiveLock(coderId);
  if (lock && lock.videoId !== videoId) {
    throw new CoderError(
      `Finish ${lock.displayCode} first. You started it and one video is worked at a time`,
      423,
      "locked_elsewhere",
      { videoId: lock.videoId, displayCode: lock.displayCode },
    );
  }
  if (!rows[0]) throw new CoderError("Not found", 404);
  return rows[0];
}

async function logEvent(
  coderId: string,
  dataset: Dataset,
  kind: string,
  refs: { videoId?: string; observationId?: string },
  payload?: Record<string, unknown>,
) {
  await coderDb.insert(events).values({
    userId: coderId,
    dataset,
    kind,
    videoId: refs.videoId ?? null,
    observationId: refs.observationId ?? null,
    payload: payload ?? null,
  });
}

async function getOwnObservation(coderId: string, videoId: string) {
  const rows = await coderDb
    .select({
      id: observations.id,
      status: observations.status,
      rubricVersionId: observations.rubricVersionId,
      dataset: observations.dataset,
    })
    .from(observations)
    .where(
      and(eq(observations.videoId, videoId), eq(observations.coderId, coderId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Get-or-create the coder's observation for an assigned video. */
export async function ensureObservation(coderId: string, videoId: string) {
  // dataset follows the ASSIGNMENT, not the account: an admin working a
  // training video writes training rows, never contaminating live data.
  // Stamped server-side either way — the client has no say.
  const { dataset } = await assertAssigned(coderId, videoId);
  const existing = await getOwnObservation(coderId, videoId);
  if (existing) return existing;

  const rubric = await getActiveRubricVersion();
  if (!rubric) throw new CoderError("No rubric version is seeded", 500);

  const [created] = await coderDb
    .insert(observations)
    .values({
      videoId,
      coderId,
      dataset,
      status: "in_progress",
      startedAt: new Date(),
      rubricVersionId: rubric.id,
    })
    .returning({
      id: observations.id,
      status: observations.status,
      rubricVersionId: observations.rubricVersionId,
      dataset: observations.dataset,
    });
  await logEvent(coderId, dataset, "observation_started", {
    videoId,
    observationId: created.id,
  });
  return created;
}

/** Create or update one of the coder's own notes. Timestamp is OPTIONAL. */
export async function saveNote(
  coderId: string,
  videoId: string,
  input: { noteId?: string; body: string; videoTimestampSeconds?: number | null },
) {
  const observation = await ensureObservation(coderId, videoId);
  const dataset = observation.dataset;

  if (input.noteId) {
    const updated = await coderDb
      .update(notes)
      .set({
        body: input.body,
        videoTimestampSeconds: input.videoTimestampSeconds ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notes.id, input.noteId),
          eq(notes.observationId, observation.id),
          isNull(notes.deletedAt),
        ),
      )
      .returning({ id: notes.id, updatedAt: notes.updatedAt });
    if (!updated[0]) throw new CoderError("Note not found", 404);
    return updated[0];
  }

  const [created] = await coderDb
    .insert(notes)
    .values({
      observationId: observation.id,
      body: input.body,
      videoTimestampSeconds: input.videoTimestampSeconds ?? null,
      dataset,
    })
    .returning({ id: notes.id, updatedAt: notes.updatedAt });
  await logEvent(coderId, dataset, "note_created", {
    videoId,
    observationId: observation.id,
  });
  return created;
}

/** Soft-delete one of the coder's own notes (nothing is destructive). */
export async function deleteNote(
  coderId: string,
  videoId: string,
  noteId: string,
) {
  const observation = await getOwnObservation(coderId, videoId);
  if (!observation) throw new CoderError("Not found", 404);
  const dataset = observation.dataset;
  const updated = await coderDb
    .update(notes)
    .set({ deletedAt: new Date() })
    .where(and(eq(notes.id, noteId), eq(notes.observationId, observation.id)))
    .returning({ id: notes.id });
  if (!updated[0]) throw new CoderError("Note not found", 404);
  await logEvent(coderId, dataset, "note_deleted", {
    videoId,
    observationId: observation.id,
  });
}

/** Upsert one item's score + justification. Refused once locked. */
export async function saveScore(
  coderId: string,
  videoId: string,
  input: { itemNo: number; scoreNum: number; justification: string | null },
) {
  if (!Number.isInteger(input.itemNo) || input.itemNo < 1 || input.itemNo > 8) {
    throw new CoderError("itemNo must be 1–8", 400);
  }
  const triple = tripleFromNum(input.scoreNum); // throws on anything not 1–4
  const observation = await ensureObservation(coderId, videoId);
  const dataset = observation.dataset;
  if (observation.status === "submitted") {
    throw new CoderError("Scores are locked after submission", 409);
  }

  const existing = await coderDb
    .select({ id: scores.id, lockedAt: scores.lockedAt, scoreNum: scores.scoreNum })
    .from(scores)
    .where(
      and(eq(scores.observationId, observation.id), eq(scores.itemNo, input.itemNo)),
    )
    .limit(1);

  if (existing[0]) {
    if (existing[0].lockedAt) {
      throw new CoderError("Scores are locked after submission", 409);
    }
    const [updated] = await coderDb
      .update(scores)
      .set({
        scoreNum: triple.scoreNum,
        scoreColumn: triple.scoreColumn,
        scoreDegree: triple.scoreDegree,
        justification: input.justification,
        updatedAt: new Date(),
      })
      .where(eq(scores.id, existing[0].id))
      .returning({ id: scores.id, updatedAt: scores.updatedAt });
    if (existing[0].scoreNum !== triple.scoreNum) {
      await logEvent(coderId, dataset, "score_changed", {
        videoId,
        observationId: observation.id,
      }, { itemNo: input.itemNo });
    }
    return updated;
  }

  const [created] = await coderDb
    .insert(scores)
    .values({
      observationId: observation.id,
      itemNo: input.itemNo,
      scoreNum: triple.scoreNum,
      scoreColumn: triple.scoreColumn,
      scoreDegree: triple.scoreDegree,
      justification: input.justification,
      rubricVersionId: observation.rubricVersionId!,
      dataset,
    })
    .returning({ id: scores.id, updatedAt: scores.updatedAt });
  await logEvent(coderId, dataset, "score_selected", {
    videoId,
    observationId: observation.id,
  }, { itemNo: input.itemNo });
  return created;
}

/** Submit the observation: requires all 8 items scored; locks the scores. */
export async function submitObservation(coderId: string, videoId: string) {
  const observation = await getOwnObservation(coderId, videoId);
  if (!observation) throw new CoderError("Not found", 404);
  const dataset = observation.dataset;
  if (observation.status === "submitted") {
    throw new CoderError("Already submitted", 409);
  }

  const scored = await coderDb
    .select({ itemNo: scores.itemNo, justification: scores.justification })
    .from(scores)
    .where(eq(scores.observationId, observation.id));
  const missing = [1, 2, 3, 4, 5, 6, 7, 8].filter(
    (n) => !scored.some((s) => s.itemNo === n),
  );
  if (missing.length > 0) {
    throw new CoderError(`Items not yet scored: ${missing.join(", ")}`, 400);
  }
  // Justifications are never optional (Amendment §32).
  const unjustified = scored
    .filter((s) => !s.justification?.trim())
    .map((s) => s.itemNo)
    .sort((a, b) => a - b);
  if (unjustified.length > 0) {
    throw new CoderError(
      `Every score needs its justification. Missing on item${unjustified.length > 1 ? "s" : ""} ${unjustified.join(", ")}`,
      400,
    );
  }

  // An observation is only COMPLETE when there is something there
  // (Amendment §37): notes with real content and, since every coder fills
  // a card (Amendment §43), this coder's own submitted card.
  await assertAssigned(coderId, videoId);
  const noteRows = await coderDb
    .select({ body: notes.body })
    .from(notes)
    .where(and(eq(notes.observationId, observation.id), isNull(notes.deletedAt)));
  const hasNote = noteRows.some((n) => {
    const text = n.body.replace(/<[^>]*>/g, "").trim();
    return text.length > 0;
  });
  if (!hasNote) {
    throw new CoderError(
      "Write your notes before submitting. An observation with an empty notebook is not complete",
      400,
    );
  }
  const [card] = await coderDb
    .select({ status: contextCards.status })
    .from(contextCards)
    .where(and(eq(contextCards.videoId, videoId), eq(contextCards.authoredBy, coderId)));
  if (card?.status !== "submitted") {
    throw new CoderError(
      "Submit your context card before submitting your scores. Every coder fills one",
      400,
    );
  }

  const now = new Date();
  await coderDb
    .update(scores)
    .set({ submittedAt: now, lockedAt: now })
    .where(and(eq(scores.observationId, observation.id), isNull(scores.lockedAt)));
  await coderDb
    .update(observations)
    .set({ status: "submitted", submittedAt: now })
    .where(eq(observations.id, observation.id));
  await endOpenSection(observation.id, "scores", "submitted", now);
  // The observation is complete → the single-video lock is released
  // (Amendment §45). Notes stay editable? No: submission locks scores; notes
  // remain readable. The coder may start the next video.
  await coderDb
    .update(videoLocks)
    .set({ releasedAt: now, releasedBy: coderId, releaseReason: "observation submitted" })
    .where(and(eq(videoLocks.coderId, coderId), eq(videoLocks.videoId, videoId), isNull(videoLocks.releasedAt)));
  await logEvent(coderId, dataset, "observation_submitted", {
    videoId,
    observationId: observation.id,
  });
  return { submittedAt: now };
}

/* --------------------------- context card --------------------------- */

export interface ContextCardInput {
  subject?: string | null;
  composition?: "all_boys" | "all_girls" | "mixed" | null;
  approxCount?: string | null;
  uniforms?: string | null;
  appearanceCaveats?: string | null;
  room?: string | null;
  camera?: string | null;
  notes?: string | null;
  timeline?: string | null;
  settingChange?: string | null;
  adults: Array<{
    adultNo: number;
    role?: "teacher" | "camera_operator" | "other" | null;
    sex?: "male" | "female" | "unknown" | null;
    clothing?: string | null;
    clothingCaveats?: string | null;
    features?: string | null;
    behavior?: string | null;
    speaks?: "yes" | "no" | null;
  }>;
}

/**
 * Save the context card. Only the assigned card-filler may write it, and
 * only while it is a draft (Amendment A/B: one card per video).
 */
export async function saveContextCard(
  coderId: string,
  videoId: string,
  input: ContextCardInput,
) {
  // Amendment §43: every coder fills their own card; no duty check.
  const { dataset } = await assertAssigned(coderId, videoId);
  if (input.adults.length > 6) throw new CoderError("At most six adults", 400);
  for (const a of input.adults) {
    if (!Number.isInteger(a.adultNo) || a.adultNo < 1 || a.adultNo > 6) {
      throw new CoderError("adultNo must be 1–6", 400);
    }
  }
  await ensureObservation(coderId, videoId);

  const fields = {
    subject: input.subject ?? null,
    composition: input.composition ?? null,
    approxCount: input.approxCount ?? null,
    uniforms: input.uniforms ?? null,
    appearanceCaveats: input.appearanceCaveats ?? null,
    room: input.room ?? null,
    camera: input.camera ?? null,
    notes: input.notes ?? null,
    timeline: input.timeline ?? null,
    settingChange: input.settingChange ?? null,
    updatedAt: new Date(),
  };

  const existing = await coderDb
    .select({
      id: contextCards.id,
      status: contextCards.status,
    })
    .from(contextCards)
    .where(and(eq(contextCards.videoId, videoId), eq(contextCards.authoredBy, coderId)))
    .limit(1);

  let cardId: string;
  if (existing[0]) {
    if (existing[0].status === "submitted") {
      throw new CoderError("The card is submitted and read-only", 409);
    }
    cardId = existing[0].id;
    await coderDb.update(contextCards).set(fields).where(eq(contextCards.id, cardId));
  } else {
    const [created] = await coderDb
      .insert(contextCards)
      .values({ videoId, authoredBy: coderId, dataset, ...fields })
      .returning({ id: contextCards.id });
    cardId = created.id;
    await logEvent(coderId, dataset, "context_card_started", { videoId });
  }

  // Reconcile adults: upsert by adultNo, soft-delete the rest.
  const currentAdults = await coderDb
    .select({ id: contextAdults.id, adultNo: contextAdults.adultNo })
    .from(contextAdults)
    .where(and(eq(contextAdults.contextCardId, cardId), isNull(contextAdults.deletedAt)));

  for (const a of input.adults) {
    const adultFields = {
      role: a.role ?? null,
      sex: a.sex ?? null,
      clothing: a.clothing ?? null,
      clothingCaveats: a.clothingCaveats ?? null,
      features: a.features ?? null,
      behavior: a.behavior ?? null,
      speaks: a.speaks ?? null,
    };
    const match = currentAdults.find((c) => c.adultNo === a.adultNo);
    if (match) {
      await coderDb
        .update(contextAdults)
        .set(adultFields)
        .where(eq(contextAdults.id, match.id));
    } else {
      // A previously soft-deleted adultNo may exist; revive it to respect
      // the unique index rather than inserting a duplicate.
      const revived = await coderDb
        .update(contextAdults)
        .set({ ...adultFields, deletedAt: null })
        .where(
          and(eq(contextAdults.contextCardId, cardId), eq(contextAdults.adultNo, a.adultNo)),
        )
        .returning({ id: contextAdults.id });
      if (!revived[0]) {
        await coderDb
          .insert(contextAdults)
          .values({ contextCardId: cardId, adultNo: a.adultNo, ...adultFields });
      }
    }
  }
  const keep = new Set(input.adults.map((a) => a.adultNo));
  for (const c of currentAdults) {
    if (!keep.has(c.adultNo)) {
      await coderDb
        .update(contextAdults)
        .set({ deletedAt: new Date() })
        .where(eq(contextAdults.id, c.id));
    }
  }

  return { cardId, savedAt: fields.updatedAt };
}

/** Submit this coder's own context card (becomes read-only). */
export async function submitContextCard(coderId: string, videoId: string) {
  const { dataset } = await assertAssigned(coderId, videoId);
  const existing = await coderDb
    .select({
      id: contextCards.id,
      status: contextCards.status,
    })
    .from(contextCards)
    .where(and(eq(contextCards.videoId, videoId), eq(contextCards.authoredBy, coderId)))
    .limit(1);
  if (!existing[0]) {
    throw new CoderError("Not found", 404);
  }
  // An empty card is not a card (Amendment §33): the essentials must be
  // filled, and every lesson has at least one adult in the room.
  const [cardRow] = await coderDb
    .select({
      subject: contextCards.subject,
      composition: contextCards.composition,
      approxCount: contextCards.approxCount,
    })
    .from(contextCards)
    .where(eq(contextCards.id, existing[0].id));
  const adultsPresent = await coderDb
    .select({ id: contextAdults.id })
    .from(contextAdults)
    .where(
      and(
        eq(contextAdults.contextCardId, existing[0].id),
        isNull(contextAdults.deletedAt),
      ),
    )
    .limit(1);
  // Amendment §42: subject is no longer asked (it comes from the mapping
  // file), so the minimum is composition + count + one adult (§33).
  const gaps: string[] = [];
  if (!cardRow.composition) gaps.push("composition");
  if (!cardRow.approxCount?.trim()) gaps.push("approximate pupil count");
  if (adultsPresent.length === 0) gaps.push("at least one adult");
  if (gaps.length > 0) {
    throw new CoderError(
      `The card still needs: ${gaps.join(", ")}.`,
      400,
    );
  }
  const now = new Date();
  if (existing[0].status === "submitted") throw new CoderError("Already submitted", 409);
  await coderDb
    .update(contextCards)
    .set({ status: "submitted", submittedAt: now, updatedAt: now })
    .where(eq(contextCards.id, existing[0].id));
  const own = await getOwnObservation(coderId, videoId);
  if (own) await endOpenSection(own.id, "context_card", "submitted", now);
  await logEvent(coderId, dataset, "context_card_submitted", { videoId });
  return { submittedAt: now };
}

/* ---------------- one video at a time (Amendment §45) ---------------- */

export interface ActiveLock {
  id: string;
  videoId: string;
  displayCode: string;
  startedAt: Date;
}

/** The coder's active lock, if any (the video they must finish first). */
export async function getActiveLock(coderId: string): Promise<ActiveLock | null> {
  const rows = await coderDb
    .select({
      id: videoLocks.id,
      videoId: videoLocks.videoId,
      displayCode: videos.displayCode,
      startedAt: videoLocks.startedAt,
    })
    .from(videoLocks)
    .innerJoin(videos, eq(videos.id, videoLocks.videoId))
    .where(and(eq(videoLocks.coderId, coderId), isNull(videoLocks.releasedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * "Do you want to start this video?" → yes. Takes the coder's single lock
 * and opens the observation. Idempotent for the locked video; refused
 * (423) while another video is locked.
 */
export async function startVideo(coderId: string, videoId: string) {
  const { dataset } = await assertAssigned(coderId, videoId); // 423 if locked elsewhere
  const existing = await getActiveLock(coderId);
  if (!existing) {
    await coderDb.insert(videoLocks).values({ coderId, videoId, dataset });
    await logEvent(coderId, dataset, "video_started", { videoId });
  }
  const observation = await ensureObservation(coderId, videoId);
  return { observationId: observation.id, lock: (await getActiveLock(coderId))! };
}

/* ------------------- timed sections (Amendment §44) ------------------- */

export type SectionKind = "context_card" | "notes" | "scores";
type SectionEndReason = "submitted" | "closed" | "abrupt" | "admin_released";

/** A sitting whose heartbeat is older than this is over (abruptly). */
const STALE_MS = 2 * 60 * 1000;

export interface SectionState {
  /** The sitting currently open in this browser, if any. */
  open: { id: string; startedAt: Date } | null;
  /** True when the last sitting did not end with a submission and no
   *  reason has been recorded yet — the coder must say why before the
   *  section reopens. */
  needsResumeReason: boolean;
  sittings: number;
  lastEndReason: SectionEndReason | null;
  submitted: boolean;
}

async function endOpenSection(
  observationId: string,
  section: SectionKind,
  reason: SectionEndReason,
  at: Date,
) {
  await coderDb
    .update(sectionSessions)
    .set({ endedAt: at, endReason: reason })
    .where(
      and(
        eq(sectionSessions.observationId, observationId),
        eq(sectionSessions.section, section),
        isNull(sectionSessions.endedAt),
      ),
    );
}

/** Mark any open sitting whose heartbeat went stale as ended abruptly. */
async function sweepStaleSections(observationId: string, section: SectionKind, now: Date) {
  const stale = await coderDb
    .select({ id: sectionSessions.id, lastHeartbeatAt: sectionSessions.lastHeartbeatAt })
    .from(sectionSessions)
    .where(
      and(
        eq(sectionSessions.observationId, observationId),
        eq(sectionSessions.section, section),
        isNull(sectionSessions.endedAt),
      ),
    );
  for (const s of stale) {
    if (now.getTime() - s.lastHeartbeatAt.getTime() > STALE_MS) {
      await coderDb
        .update(sectionSessions)
        .set({ endedAt: s.lastHeartbeatAt, endReason: "abrupt" })
        .where(eq(sectionSessions.id, s.id));
    }
  }
}

export async function getSectionState(
  coderId: string,
  videoId: string,
  section: SectionKind,
  submitted: boolean,
): Promise<SectionState> {
  const own = await getOwnObservation(coderId, videoId);
  if (!own) return { open: null, needsResumeReason: false, sittings: 0, lastEndReason: null, submitted };
  const now = new Date();
  await sweepStaleSections(own.id, section, now);
  const rows = await coderDb
    .select({
      id: sectionSessions.id,
      startedAt: sectionSessions.startedAt,
      endedAt: sectionSessions.endedAt,
      endReason: sectionSessions.endReason,
      resumeReason: sectionSessions.resumeReason,
    })
    .from(sectionSessions)
    .where(and(eq(sectionSessions.observationId, own.id), eq(sectionSessions.section, section)))
    .orderBy(desc(sectionSessions.startedAt));
  const open = rows.find((r) => !r.endedAt) ?? null;
  const last = rows.find((r) => !!r.endedAt) ?? null;
  const needsResumeReason =
    !open && !submitted && !!last && last.endReason !== "submitted" && !last.resumeReason;
  return {
    open: open ? { id: open.id, startedAt: open.startedAt } : null,
    needsResumeReason,
    sittings: rows.length,
    lastEndReason: last?.endReason ?? null,
    submitted,
  };
}

/**
 * Open a sitting on a section. If the previous sitting did not end with a
 * submission, a resume reason is required first (428 with code
 * resume_reason_required); it is written onto that previous sitting.
 */
export async function startSection(
  coderId: string,
  videoId: string,
  section: SectionKind,
  device: DeviceKind,
  resumeReason?: string | null,
) {
  const { dataset } = await assertAssigned(coderId, videoId);
  const lock = await getActiveLock(coderId);
  if (!lock || lock.videoId !== videoId) {
    throw new CoderError("Start the video first", 409, "video_not_started");
  }
  const own = await ensureObservation(coderId, videoId);
  const now = new Date();
  await sweepStaleSections(own.id, section, now);

  const openRows = await coderDb
    .select({ id: sectionSessions.id, startedAt: sectionSessions.startedAt })
    .from(sectionSessions)
    .where(
      and(
        eq(sectionSessions.observationId, own.id),
        eq(sectionSessions.section, section),
        isNull(sectionSessions.endedAt),
      ),
    )
    .limit(1);
  if (openRows[0]) {
    // Same sitting (e.g. a reload): refresh the heartbeat, hand it back.
    await coderDb
      .update(sectionSessions)
      .set({ lastHeartbeatAt: now })
      .where(eq(sectionSessions.id, openRows[0].id));
    return { sessionId: openRows[0].id, startedAt: openRows[0].startedAt, resumed: false };
  }

  const lastRows = await coderDb
    .select({
      id: sectionSessions.id,
      endReason: sectionSessions.endReason,
      endedAt: sectionSessions.endedAt,
      resumeReason: sectionSessions.resumeReason,
    })
    .from(sectionSessions)
    .where(and(eq(sectionSessions.observationId, own.id), eq(sectionSessions.section, section)))
    .orderBy(desc(sectionSessions.startedAt))
    .limit(1);
  const last = lastRows[0];
  if (last && last.endReason !== "submitted" && !last.resumeReason) {
    const reason = resumeReason?.trim();
    if (!reason) {
      throw new CoderError(
        "Your last sitting on this section did not finish. Say briefly what happened before continuing",
        428,
        "resume_reason_required",
        { endedAt: last.endedAt, endReason: last.endReason },
      );
    }
    await coderDb
      .update(sectionSessions)
      .set({ resumeReason: reason.slice(0, 500) })
      .where(eq(sectionSessions.id, last.id));
  }

  const [created] = await coderDb
    .insert(sectionSessions)
    .values({
      observationId: own.id,
      coderId,
      videoId,
      section,
      device,
      dataset,
      startedAt: now,
      lastHeartbeatAt: now,
    })
    .returning({ id: sectionSessions.id, startedAt: sectionSessions.startedAt });
  await logEvent(coderId, dataset, "section_started", { videoId, observationId: own.id }, {
    section,
    device,
    sessionId: created.id,
    resumed: !!last,
  });
  return { sessionId: created.id, startedAt: created.startedAt, resumed: !!last };
}

async function ownSection(coderId: string, sessionId: string) {
  const rows = await coderDb
    .select({
      id: sectionSessions.id,
      videoId: sectionSessions.videoId,
      observationId: sectionSessions.observationId,
      section: sectionSessions.section,
      endedAt: sectionSessions.endedAt,
      dataset: sectionSessions.dataset,
    })
    .from(sectionSessions)
    .where(and(eq(sectionSessions.id, sessionId), eq(sectionSessions.coderId, coderId)))
    .limit(1);
  if (!rows[0]) throw new CoderError("Not found", 404);
  return rows[0];
}

export async function heartbeatSection(coderId: string, sessionId: string) {
  const s = await ownSection(coderId, sessionId);
  if (s.endedAt) return { ended: true };
  await coderDb
    .update(sectionSessions)
    .set({ lastHeartbeatAt: new Date() })
    .where(eq(sectionSessions.id, s.id));
  return { ended: false };
}

/** The coder leaves the section on purpose (tab closed, navigated away). */
export async function endSection(coderId: string, sessionId: string) {
  const s = await ownSection(coderId, sessionId);
  if (s.endedAt) return { ended: true };
  const now = new Date();
  await coderDb
    .update(sectionSessions)
    .set({ endedAt: now, endReason: "closed" })
    .where(eq(sectionSessions.id, s.id));
  await logEvent(coderId, s.dataset, "section_ended", { videoId: s.videoId, observationId: s.observationId }, {
    section: s.section,
    sessionId: s.id,
    reason: "closed",
  });
  return { ended: true };
}

/* ------------------------------------------------------------------ */
/* My coding statistics (own rows only — never anyone else's)          */
/* ------------------------------------------------------------------ */

export interface MyCodingStats {
  submittedVideos: number;
  scoredItems: number;
  distribution: Record<1 | 2 | 3 | 4, number>;
  perItem: Array<{ itemNo: number; mean: number; n: number }>;
  avgJustificationWords: number;
  lastSubmittedAt: Date | null;
}

/** How this coder codes: their submitted scores, summarized for their own
 *  dashboard (Amendment §38). Reads nothing about anyone else. */
export async function getMyCodingStats(coderId: string): Promise<MyCodingStats> {
  const myObs = await coderDb
    .select({ id: observations.id, submittedAt: observations.submittedAt })
    .from(observations)
    .where(
      and(eq(observations.coderId, coderId), eq(observations.status, "submitted")),
    );
  if (myObs.length === 0) {
    return {
      submittedVideos: 0,
      scoredItems: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0 },
      perItem: [],
      avgJustificationWords: 0,
      lastSubmittedAt: null,
    };
  }
  const myScores = await coderDb
    .select({
      itemNo: scores.itemNo,
      scoreNum: scores.scoreNum,
      justification: scores.justification,
    })
    .from(scores)
    .where(inArray(scores.observationId, myObs.map((o) => o.id)));

  const distribution: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const perItemAcc = new Map<number, { sum: number; n: number }>();
  let words = 0;
  for (const s of myScores) {
    distribution[s.scoreNum as 1 | 2 | 3 | 4]++;
    const acc = perItemAcc.get(s.itemNo) ?? { sum: 0, n: 0 };
    acc.sum += s.scoreNum;
    acc.n++;
    perItemAcc.set(s.itemNo, acc);
    words += (s.justification ?? "").trim().split(/\s+/).filter(Boolean).length;
  }
  const perItem = [...perItemAcc.entries()]
    .map(([itemNo, a]) => ({ itemNo, mean: a.sum / a.n, n: a.n }))
    .sort((a, b) => a.itemNo - b.itemNo);
  const lastSubmittedAt = myObs
    .map((o) => o.submittedAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    submittedVideos: myObs.length,
    scoredItems: myScores.length,
    distribution,
    perItem,
    avgJustificationWords: myScores.length ? Math.round(words / myScores.length) : 0,
    lastSubmittedAt,
  };
}
