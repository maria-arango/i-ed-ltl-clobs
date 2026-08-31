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
import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  assignmentRaters,
  assignments,
  contextAdults,
  contextCards,
  notes,
  observations,
  scores,
  videos,
} from "@/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_CODER,
  max: 5,
});

const coderDb = drizzle(pool);

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
}

/** The coder's own assigned videos, with their own progress. */
export async function getCoderQueue(coderId: string): Promise<QueueRow[]> {
  return coderDb
    .select({
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

  const { authoredBy: _authoredBy, ...cardFields } = row;
  return {
    locked: false,
    authoredByMe,
    card: { ...cardFields, adults },
  };
}
