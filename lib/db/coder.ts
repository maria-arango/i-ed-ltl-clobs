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
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
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
  users,
  videos,
} from "@/db/schema";

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

export interface WorkspaceContextCard {
  /** True when the card exists but this coder may not read it yet
   *  (they are not its author and have not submitted their own scores —
   *  Amendment A). */
  locked: boolean;
  authoredByMe: boolean;
  card: {
    id: string;
    status: string;
    /** The confirm/flag second pass (Amendment A). */
    confirmedAt: Date | null;
    confirmedByMe: boolean;
    flagged: boolean;
    flagReason: string | null;
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
  } | null;
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

  const contextCard = await getContextCardForCoder(
    coderId,
    videoId,
    observation?.status === "submitted",
  );

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
  };
}

/**
 * Amendment A visibility: the author always sees their own card; the other
 * coder sees it only after submitting their own individual scores.
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
      confirmedBy: contextCards.confirmedBy,
      confirmedAt: contextCards.confirmedAt,
      flagged: contextCards.flagged,
      flagReason: contextCards.flagReason,
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
    .where(eq(contextCards.videoId, videoId))
    .limit(1);

  const row = cardRows[0];
  if (!row) return { locked: false, authoredByMe: false, card: null };

  const authoredByMe = row.authoredBy === coderId;
  if (!authoredByMe && !hasSubmittedOwnScores) {
    // The card exists, but releasing any field of it — including who wrote
    // it — before this coder's own submission would leak observations.
    return { locked: true, authoredByMe: false, card: null };
  }

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
        eq(contextAdults.contextCardId, row.id),
        isNull(contextAdults.deletedAt),
      ),
    )
    .orderBy(asc(contextAdults.adultNo));

  const { authoredBy: _authoredBy, confirmedBy, ...cardFields } = row;
  return {
    locked: false,
    authoredByMe,
    card: {
      ...cardFields,
      confirmedByMe: confirmedBy === coderId,
      adults,
    },
  };
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
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export { CoderError };

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
  // (Amendment §37): notes with real content, and — when this coder fills
  // the context card — a submitted card.
  const { fillsContextCard } = await assertAssigned(coderId, videoId);
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
  if (fillsContextCard) {
    const [card] = await coderDb
      .select({ status: contextCards.status })
      .from(contextCards)
      .where(eq(contextCards.videoId, videoId));
    if (card?.status !== "submitted") {
      throw new CoderError(
        "The context card for this video is yours to fill. Submit it before submitting your scores",
        400,
      );
    }
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
  const { fillsContextCard, dataset } = await assertAssigned(coderId, videoId);
  if (!fillsContextCard) {
    throw new CoderError("The context card for this video is not yours to fill", 403);
  }
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
      authoredBy: contextCards.authoredBy,
      flagged: contextCards.flagged,
    })
    .from(contextCards)
    .where(eq(contextCards.videoId, videoId))
    .limit(1);

  let cardId: string;
  if (existing[0]) {
    if (existing[0].authoredBy !== coderId) {
      throw new CoderError("The card was authored by someone else", 403);
    }
    // A FLAGGED submitted card reopens for its author (Amendment A second
    // pass); otherwise submitted stays read-only.
    if (existing[0].status === "submitted" && !existing[0].flagged) {
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

/** Submit the context card (author only; becomes read-only). */
export async function submitContextCard(coderId: string, videoId: string) {
  const { dataset } = await assertAssigned(coderId, videoId);
  const existing = await coderDb
    .select({
      id: contextCards.id,
      status: contextCards.status,
      authoredBy: contextCards.authoredBy,
      flagged: contextCards.flagged,
    })
    .from(contextCards)
    .where(eq(contextCards.videoId, videoId))
    .limit(1);
  if (!existing[0] || existing[0].authoredBy !== coderId) {
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
  const gaps: string[] = [];
  if (!cardRow.subject?.trim()) gaps.push("subject");
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
  if (existing[0].status === "submitted") {
    if (!existing[0].flagged) throw new CoderError("Already submitted", 409);
    // Resubmission after a flag: the flag is resolved by the author, the
    // partner's confirmation resets so they review the updated card.
    await coderDb
      .update(contextCards)
      .set({
        submittedAt: now,
        updatedAt: now,
        flagged: false,
        flagResolvedBy: coderId,
        flagResolvedAt: now,
        confirmedBy: null,
        confirmedAt: null,
      })
      .where(eq(contextCards.id, existing[0].id));
    await logEvent(coderId, dataset, "context_card_flag_resolved", { videoId });
    return { submittedAt: now };
  }
  await coderDb
    .update(contextCards)
    .set({ status: "submitted", submittedAt: now, updatedAt: now })
    .where(eq(contextCards.id, existing[0].id));
  await logEvent(coderId, dataset, "context_card_submitted", { videoId });
  return { submittedAt: now };
}

/* ------------------ card second pass (Amendment A) ------------------- */

async function getReviewableCard(coderId: string, videoId: string) {
  const { dataset } = await assertAssigned(coderId, videoId);
  const own = await getOwnObservation(coderId, videoId);
  if (own?.status !== "submitted") {
    throw new CoderError("Submit your own scores before reviewing the card", 409);
  }
  const rows = await coderDb
    .select({
      id: contextCards.id,
      status: contextCards.status,
      authoredBy: contextCards.authoredBy,
      flagged: contextCards.flagged,
      confirmedBy: contextCards.confirmedBy,
    })
    .from(contextCards)
    .where(eq(contextCards.videoId, videoId))
    .limit(1);
  const card = rows[0];
  if (!card || card.status !== "submitted") {
    throw new CoderError("The card has not been submitted yet", 409);
  }
  if (card.authoredBy === coderId) {
    throw new CoderError("You wrote this card; your partner reviews it", 403);
  }
  return { card, dataset };
}

/** Confirm the partner's card as accurate (second pass, Amendment A). */
export async function confirmContextCard(coderId: string, videoId: string) {
  const { card, dataset } = await getReviewableCard(coderId, videoId);
  if (card.flagged) {
    throw new CoderError("The card is flagged; wait for the update", 409);
  }
  if (card.confirmedBy) throw new CoderError("Already confirmed", 409);
  const now = new Date();
  await coderDb
    .update(contextCards)
    .set({ confirmedBy: coderId, confirmedAt: now, updatedAt: now })
    .where(eq(contextCards.id, card.id));
  await logEvent(coderId, dataset, "context_card_confirmed", { videoId });
  return { confirmedAt: now };
}

/** Flag the partner's card with a reason; the author can then revise. */
export async function flagContextCard(
  coderId: string,
  videoId: string,
  reason: string,
) {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new CoderError("Say briefly what looks wrong, so it can be fixed", 400);
  }
  const { card, dataset } = await getReviewableCard(coderId, videoId);
  if (card.flagged) throw new CoderError("Already flagged", 409);
  const now = new Date();
  await coderDb
    .update(contextCards)
    .set({
      flagged: true,
      flagReason: trimmed,
      confirmedBy: null,
      confirmedAt: null,
      updatedAt: now,
    })
    .where(eq(contextCards.id, card.id));
  await logEvent(coderId, dataset, "context_card_flagged", { videoId });
  return { flagged: true };
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
