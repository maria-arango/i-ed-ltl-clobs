/**
 * Shared test-fixture cleanup. Runs BEFORE a suite (heals leftovers from a
 * previous crashed run) and AFTER it. Deletes only rows tied to the given
 * fixture display codes / emails — all created under dataset='test', whose
 * locked scores are deletable by design (migration 0003).
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentRaters,
  assignments,
  contextAdults,
  contextCards,
  events,
  notes,
  observations,
  pairs,
  pairMembers,
  rubricAnchors,
  rubricConcepts,
  rubricExamples,
  rubricGuidance,
  rubricIndicators,
  rubricVersions,
  scoreNoteCitations,
  scores,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";
import { like } from "drizzle-orm";

export async function purgeFixture(opts: {
  displayCodes: string[];
  emails: string[];
  pairLabels: string[];
  rubricVersionPrefix?: string;
}) {
  const videoRows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(inArray(videos.displayCode, opts.displayCodes));
  const videoIds = videoRows.map((v) => v.id);

  if (videoIds.length > 0) {
    const obs = await db
      .select({ id: observations.id })
      .from(observations)
      .where(inArray(observations.videoId, videoIds));
    const obsIds = obs.map((o) => o.id);

    await db.delete(events).where(inArray(events.videoId, videoIds));
    if (obsIds.length > 0) {
      const scoreRows = await db
        .select({ id: scores.id })
        .from(scores)
        .where(inArray(scores.observationId, obsIds));
      if (scoreRows.length > 0) {
        await db.delete(scoreNoteCitations).where(
          inArray(
            scoreNoteCitations.scoreId,
            scoreRows.map((s) => s.id),
          ),
        );
      }
      await db.delete(scores).where(inArray(scores.observationId, obsIds));
      await db.delete(notes).where(inArray(notes.observationId, obsIds));
    }
    const cards = await db
      .select({ id: contextCards.id })
      .from(contextCards)
      .where(inArray(contextCards.videoId, videoIds));
    if (cards.length > 0) {
      await db.delete(contextAdults).where(
        inArray(
          contextAdults.contextCardId,
          cards.map((c) => c.id),
        ),
      );
      await db.delete(contextCards).where(inArray(contextCards.videoId, videoIds));
    }
    await db.delete(observations).where(inArray(observations.videoId, videoIds));

    const assn = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(inArray(assignments.videoId, videoIds));
    if (assn.length > 0) {
      await db.delete(assignmentRaters).where(
        inArray(
          assignmentRaters.assignmentId,
          assn.map((a) => a.id),
        ),
      );
      await db.delete(assignments).where(inArray(assignments.videoId, videoIds));
    }
    await db.delete(videoProvenance).where(inArray(videoProvenance.videoId, videoIds));
    await db.delete(videos).where(inArray(videos.id, videoIds));
  }

  const pairRows = await db
    .select({ id: pairs.id })
    .from(pairs)
    .where(inArray(pairs.label, opts.pairLabels));
  if (pairRows.length > 0) {
    await db.delete(pairMembers).where(
      inArray(
        pairMembers.pairId,
        pairRows.map((p) => p.id),
      ),
    );
    await db.delete(pairs).where(
      inArray(
        pairs.id,
        pairRows.map((p) => p.id),
      ),
    );
  }

  if (opts.rubricVersionPrefix) {
    // Observations (possibly from ANOTHER suite running in parallel, e.g.
    // when no live rubric was seeded and a fixture version became "active")
    // may reference these rubric versions — remove dependents first, or the
    // FK on observations.rubric_version_id refuses the delete.
    const rvs = await db
      .select({ id: rubricVersions.id })
      .from(rubricVersions)
      .where(like(rubricVersions.versionLabel, `${opts.rubricVersionPrefix}%`));
    const rvIds = rvs.map((r) => r.id);
    if (rvIds.length > 0) {
      const obs = await db
        .select({ id: observations.id })
        .from(observations)
        .where(inArray(observations.rubricVersionId, rvIds));
      const obsIds = obs.map((o) => o.id);
      if (obsIds.length > 0) {
        const scoreRows = await db
          .select({ id: scores.id })
          .from(scores)
          .where(inArray(scores.observationId, obsIds));
        if (scoreRows.length > 0) {
          await db.delete(scoreNoteCitations).where(
            inArray(
              scoreNoteCitations.scoreId,
              scoreRows.map((s) => s.id),
            ),
          );
        }
        await db.delete(scores).where(inArray(scores.observationId, obsIds));
        await db.delete(notes).where(inArray(notes.observationId, obsIds));
        await db.delete(events).where(inArray(events.observationId, obsIds));
        await db.delete(observations).where(inArray(observations.id, obsIds));
      }
      // Rubric content rows also reference the version.
      const concepts = await db
        .select({ id: rubricConcepts.id })
        .from(rubricConcepts)
        .where(inArray(rubricConcepts.rubricVersionId, rvIds));
      const conceptIds = concepts.map((c) => c.id);
      if (conceptIds.length > 0) {
        await db.delete(rubricIndicators).where(inArray(rubricIndicators.conceptId, conceptIds));
        await db.delete(rubricAnchors).where(inArray(rubricAnchors.conceptId, conceptIds));
        await db.delete(rubricExamples).where(inArray(rubricExamples.conceptId, conceptIds));
        await db.delete(rubricConcepts).where(inArray(rubricConcepts.id, conceptIds));
      }
      await db.delete(rubricGuidance).where(inArray(rubricGuidance.rubricVersionId, rvIds));
      await db.delete(rubricVersions).where(inArray(rubricVersions.id, rvIds));
    }
  }

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, opts.emails));
  for (const u of userRows) {
    await db.delete(events).where(eq(events.userId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
}
