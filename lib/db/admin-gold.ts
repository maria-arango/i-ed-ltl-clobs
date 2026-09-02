/**
 * Gold standard + certification (ADMIN-ONLY layer — §3: gold flags, master
 * scores and raw identifiers never cross into coder-facing code; the
 * restricted role cannot read these tables at all).
 *
 * - Gold videos: flagged on `videos.is_gold`, master scores in
 *   `gold_scores` (one row per item, fixed encoding, rubric-versioned).
 * - Certification (addendum §9, Amendment B §9): trainees code the gold
 *   videos in the training sandbox; their agreement against the master
 *   scores is computed here; an admin decides and — on a pass — promotes
 *   the account to live. Every decision lands in `certifications` and the
 *   audit log.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  certifications,
  goldScores,
  observations,
  rubricConcepts,
  rubricVersions,
  scores,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";
import { tripleFromNum } from "@/lib/score";

async function audit(
  actorId: string,
  action: string,
  subjectId: string,
  details: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    actorId,
    action,
    subjectTable: "videos",
    subjectId,
    details,
  });
}

async function activeRubric() {
  const rows = await db
    .select({ id: rubricVersions.id, versionLabel: rubricVersions.versionLabel })
    .from(rubricVersions)
    .orderBy(sql`${rubricVersions.effectiveFrom} DESC NULLS LAST`)
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------- gold set ---------------------------- */

export interface GoldVideoRow {
  videoId: string;
  displayCode: string;
  rawFilename: string;
  scoresEntered: number;
  hasDriveUrl: boolean;
}

export async function listGoldVideos(): Promise<GoldVideoRow[]> {
  const rows = await db
    .select({
      videoId: videos.id,
      displayCode: videos.displayCode,
      rawFilename: videoProvenance.rawFilename,
      driveUrl: videos.driveUrl,
    })
    .from(videos)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .where(and(eq(videos.isGold, true), eq(videos.dataset, "live")))
    .orderBy(asc(videos.displayCode));
  if (rows.length === 0) return [];
  const counts = await db
    .select({ videoId: goldScores.videoId, n: sql<number>`count(*)` })
    .from(goldScores)
    .where(inArray(goldScores.videoId, rows.map((r) => r.videoId)))
    .groupBy(goldScores.videoId);
  const countBy = new Map(counts.map((c) => [c.videoId, Number(c.n)]));
  return rows.map((r) => ({
    videoId: r.videoId,
    displayCode: r.displayCode,
    rawFilename: r.rawFilename,
    scoresEntered: countBy.get(r.videoId) ?? 0,
    hasDriveUrl: r.driveUrl !== null && r.driveUrl !== "",
  }));
}

/** Admin search by raw filename / sid_tr prefix / display code. */
export async function searchGoldCandidates(query: string) {
  const q = query.trim();
  if (q.length < 3) return [];
  return db
    .select({
      videoId: videos.id,
      displayCode: videos.displayCode,
      rawFilename: videoProvenance.rawFilename,
      isGold: videos.isGold,
    })
    .from(videos)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .where(
      and(
        eq(videos.dataset, "live"),
        eq(videoProvenance.excluded, false),
        sql`(${videoProvenance.rawFilename} ILIKE ${"%" + q + "%"}
             OR ${videos.displayCode} ILIKE ${"%" + q + "%"})`,
      ),
    )
    .orderBy(asc(videos.displayCode))
    .limit(10);
}

export async function setGoldFlag(
  actorId: string,
  videoId: string,
  isGold: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [video] = await db
    .select({ id: videos.id, displayCode: videos.displayCode })
    .from(videos)
    .where(eq(videos.id, videoId));
  if (!video) return { ok: false, error: "No such video." };
  if (!isGold) {
    const [n] = await db
      .select({ n: sql<number>`count(*)` })
      .from(goldScores)
      .where(eq(goldScores.videoId, videoId));
    if (Number(n.n) > 0) {
      return {
        ok: false,
        error:
          "This video has master scores on record. Remove is disabled once scores exist — nothing is destructive.",
      };
    }
  }
  await db.update(videos).set({ isGold }).where(eq(videos.id, videoId));
  await audit(actorId, isGold ? "gold_flag_set" : "gold_flag_removed", videoId, {
    displayCode: video.displayCode,
  });
  if (isGold) {
    // The training pack always equals the gold set (Amendment §29):
    // every active trainee receives the new video immediately.
    const { assignGoldToAllTrainees } = await import("@/lib/db/admin-training");
    await assignGoldToAllTrainees(actorId);
  }
  return { ok: true };
}

/* ---------------------------- master scores -------------------------- */

export async function getGoldEntry(videoId: string) {
  const [video] = await db
    .select({
      videoId: videos.id,
      displayCode: videos.displayCode,
      rawFilename: videoProvenance.rawFilename,
      isGold: videos.isGold,
    })
    .from(videos)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .where(eq(videos.id, videoId));
  if (!video || !video.isGold) return null;

  const rubric = await activeRubric();
  const concepts = rubric
    ? await db
        .select({ itemNo: rubricConcepts.itemNo, name: rubricConcepts.name })
        .from(rubricConcepts)
        .where(eq(rubricConcepts.rubricVersionId, rubric.id))
        .orderBy(asc(rubricConcepts.itemNo))
    : [];

  const existing = await db
    .select({
      itemNo: goldScores.itemNo,
      scoreNum: goldScores.scoreNum,
      rationale: goldScores.rationale,
    })
    .from(goldScores)
    .where(eq(goldScores.videoId, videoId))
    .orderBy(asc(goldScores.itemNo));

  return {
    video,
    rubricLabel: rubric?.versionLabel ?? null,
    concepts,
    existing,
  };
}

export async function saveGoldScores(
  actorId: string,
  videoId: string,
  items: Array<{ itemNo: number; scoreNum: number; rationale: string | null }>,
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  const [video] = await db
    .select({ isGold: videos.isGold, displayCode: videos.displayCode })
    .from(videos)
    .where(eq(videos.id, videoId));
  if (!video?.isGold) return { ok: false, error: "This video is not in the gold set." };
  const rubric = await activeRubric();
  if (!rubric) return { ok: false, error: "No rubric version is seeded." };

  for (const item of items) {
    if (!Number.isInteger(item.itemNo) || item.itemNo < 1 || item.itemNo > 8) {
      return { ok: false, error: "Item numbers must be 1–8." };
    }
    try {
      tripleFromNum(item.scoreNum);
    } catch {
      return { ok: false, error: `Item ${item.itemNo}: the score must be 1–4.` };
    }
    if (!item.rationale?.trim()) {
      return {
        ok: false,
        error: `Item ${item.itemNo} needs its rationale. Justifications are never optional.`,
      };
    }
  }

  await db.transaction(async (tx) => {
    for (const item of items) {
      const triple = tripleFromNum(item.scoreNum);
      await tx
        .insert(goldScores)
        .values({
          videoId,
          itemNo: item.itemNo,
          scoreNum: triple.scoreNum,
          scoreColumn: triple.scoreColumn,
          scoreDegree: triple.scoreDegree,
          rationale: item.rationale!.trim(),
          rubricVersionId: rubric.id,
          enteredBy: actorId,
        })
        .onConflictDoUpdate({
          target: [goldScores.videoId, goldScores.itemNo],
          set: {
            scoreNum: triple.scoreNum,
            scoreColumn: triple.scoreColumn,
            scoreDegree: triple.scoreDegree,
            rationale: item.rationale!.trim(),
            rubricVersionId: rubric.id,
            enteredBy: actorId,
            enteredAt: new Date(),
          },
        });
    }
    await tx.insert(auditLog).values({
      actorId,
      action: "gold_scores_saved",
      subjectTable: "gold_scores",
      subjectId: videoId,
      details: {
        displayCode: video.displayCode,
        items: items.map((i) => i.itemNo),
        rubric: rubric.versionLabel,
      },
    });
  });
  return { ok: true, saved: items.length };
}

/* ---------------------------- certification -------------------------- */

export interface TraineeAgreementRow {
  userId: string;
  name: string | null;
  email: string;
  goldVideosCoded: number;
  itemsCompared: number;
  exact: number;
  adjacent: number;
  latestStatus: string | null;
  attempts: number;
}

/**
 * Agreement of every trainee against the master scores: their SUBMITTED
 * training observations on gold-flagged videos, item by item.
 * Exact = same score; adjacent = within one point (ordinal scale, §9).
 */
export async function getTraineeAgreement(): Promise<TraineeAgreementRow[]> {
  const trainees = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.datasetScope, "training"), eq(users.isActive, true)));
  const visible = trainees.filter((t) => !t.email.endsWith("@example.invalid"));
  if (visible.length === 0) return [];

  const gold = await db
    .select({
      videoId: goldScores.videoId,
      itemNo: goldScores.itemNo,
      scoreNum: goldScores.scoreNum,
    })
    .from(goldScores)
    .innerJoin(videos, eq(videos.id, goldScores.videoId))
    .where(eq(videos.isGold, true));
  const goldByKey = new Map(gold.map((g) => [`${g.videoId}#${g.itemNo}`, g.scoreNum]));
  const goldVideoIds = [...new Set(gold.map((g) => g.videoId))];

  const rows: TraineeAgreementRow[] = [];
  for (const t of visible) {
    let goldVideosCoded = 0;
    let itemsCompared = 0;
    let exact = 0;
    let adjacent = 0;
    if (goldVideoIds.length > 0) {
      const obs = await db
        .select({ id: observations.id, videoId: observations.videoId })
        .from(observations)
        .where(
          and(
            eq(observations.coderId, t.userId),
            eq(observations.status, "submitted"),
            inArray(observations.videoId, goldVideoIds),
          ),
        );
      goldVideosCoded = obs.length;
      if (obs.length > 0) {
        const theirScores = await db
          .select({
            observationId: scores.observationId,
            itemNo: scores.itemNo,
            scoreNum: scores.scoreNum,
          })
          .from(scores)
          .where(inArray(scores.observationId, obs.map((o) => o.id)));
        const videoByObs = new Map(obs.map((o) => [o.id, o.videoId]));
        for (const s of theirScores) {
          const goldNum = goldByKey.get(`${videoByObs.get(s.observationId)}#${s.itemNo}`);
          if (goldNum === undefined) continue;
          itemsCompared++;
          if (s.scoreNum === goldNum) exact++;
          if (Math.abs(s.scoreNum - goldNum) <= 1) adjacent++;
        }
      }
    }
    const certs = await db
      .select({ status: certifications.status, createdAt: certifications.createdAt })
      .from(certifications)
      .where(eq(certifications.userId, t.userId))
      .orderBy(desc(certifications.createdAt));
    rows.push({
      userId: t.userId,
      name: t.name,
      email: t.email,
      goldVideosCoded,
      itemsCompared,
      exact,
      adjacent,
      latestStatus: certs[0]?.status ?? null,
      attempts: certs.length,
    });
  }
  return rows;
}

/**
 * Record a certification decision. A pass promotes the account to the live
 * dataset (Amendment B §9) — audited, reversible only by demoting back.
 */
export async function decideCertification(
  actorId: string,
  userId: string,
  decision: "passed" | "failed",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [trainee] = await db
    .select({ id: users.id, email: users.email, datasetScope: users.datasetScope })
    .from(users)
    .where(eq(users.id, userId));
  if (!trainee) return { ok: false, error: "No such account." };
  if (trainee.datasetScope !== "training") {
    return { ok: false, error: "Only trainee accounts can be certified." };
  }
  const agreement = (await getTraineeAgreement()).find((r) => r.userId === userId);
  const [prior] = await db
    .select({ n: sql<number>`count(*)` })
    .from(certifications)
    .where(eq(certifications.userId, userId));

  await db.transaction(async (tx) => {
    await tx.insert(certifications).values({
      userId,
      attemptNo: Number(prior.n) + 1,
      status: decision,
      resultStats: agreement
        ? {
            goldVideosCoded: agreement.goldVideosCoded,
            itemsCompared: agreement.itemsCompared,
            exact: agreement.exact,
            adjacent: agreement.adjacent,
          }
        : null,
      decidedAt: new Date(),
    });
    if (decision === "passed") {
      await tx.update(users).set({ datasetScope: "live" }).where(eq(users.id, userId));
    }
    await tx.insert(auditLog).values({
      actorId,
      action: decision === "passed" ? "trainee_certified" : "trainee_certification_failed",
      subjectTable: "users",
      subjectId: userId,
      details: { email: trainee.email, attempt: Number(prior.n) + 1 },
    });
  });
  return { ok: true };
}
