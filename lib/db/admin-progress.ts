/**
 * Study progress (ADMIN-ONLY): where every codable video stands on the
 * path pool → assigned → scored twice → calibrated. Feeds the Progress
 * dashboard's insight cards and its filterable table.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  assignments,
  auditLog,
  calibrationItems,
  calibrationSessions,
  coderAvailability,
  observations,
  pairs,
  rubricConcepts,
  rubricVersions,
  scores,
  sectionSessions,
  users,
  videoLocks,
  videoProvenance,
  videos,
} from "@/db/schema";
import {
  summarizeReliability,
  type CalibrationRecord,
  type ReliabilitySummary,
} from "@/lib/reliability";

export type ProgressStage =
  | "pool"
  | "assigned"
  | "one_submitted"
  | "ready_to_calibrate"
  | "calibrated";

export interface ProgressRow {
  videoId: string;
  displayCode: string;
  pairLabel: string | null;
  waveNo: number | null;
  submittedCount: number;
  stage: ProgressStage;
  /** Unblinded fields — this is an ADMIN surface (§3). */
  sid: string;
  arm: string | null;
  teacher: string | null;
}

export interface ProgressOverview {
  totals: Record<ProgressStage, number> & { codable: number };
  rows: ProgressRow[];
}

export async function getProgressOverview(): Promise<ProgressOverview> {
  const vids = await db
    .select({
      videoId: videos.id,
      displayCode: videos.displayCode,
      status: videos.status,
      sid: videoProvenance.sid,
      arm: videoProvenance.arm,
      teacher: videoProvenance.trId,
    })
    .from(videos)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .where(and(eq(videos.dataset, "live"), eq(videoProvenance.excluded, false)))
    .orderBy(asc(videos.displayCode));
  const videoIds = vids.map((v) => v.videoId);
  if (videoIds.length === 0) {
    return {
      totals: {
        codable: 0,
        pool: 0,
        assigned: 0,
        one_submitted: 0,
        ready_to_calibrate: 0,
        calibrated: 0,
      },
      rows: [],
    };
  }

  const assns = await db
    .select({
      videoId: assignments.videoId,
      waveNo: assignments.waveNo,
      label: pairs.label,
    })
    .from(assignments)
    .innerJoin(pairs, eq(pairs.id, assignments.pairId))
    .where(
      and(
        inArray(assignments.videoId, videoIds),
        inArray(assignments.status, ["active", "completed"]),
      ),
    );
  const assnByVideo = new Map(assns.map((a) => [a.videoId, a]));

  const obs = await db
    .select({ videoId: observations.videoId, status: observations.status })
    .from(observations)
    .where(
      and(
        inArray(observations.videoId, videoIds),
        eq(observations.dataset, "live"),
        eq(observations.status, "submitted"),
      ),
    );
  const submittedByVideo = new Map<string, number>();
  for (const o of obs) {
    submittedByVideo.set(o.videoId, (submittedByVideo.get(o.videoId) ?? 0) + 1);
  }

  const sessions = await db
    .select({
      videoId: calibrationSessions.videoId,
      status: calibrationSessions.status,
    })
    .from(calibrationSessions)
    .where(
      and(
        inArray(calibrationSessions.videoId, videoIds),
        ne(calibrationSessions.status, "voided"),
      ),
    );
  const sessionByVideo = new Map(sessions.map((s) => [s.videoId, s.status]));

  const rows: ProgressRow[] = vids.map((v) => {
    const assn = assnByVideo.get(v.videoId);
    const submitted = submittedByVideo.get(v.videoId) ?? 0;
    const cal = sessionByVideo.get(v.videoId);
    const stage: ProgressStage =
      cal === "completed"
        ? "calibrated"
        : submitted >= 2
          ? "ready_to_calibrate"
          : submitted === 1
            ? "one_submitted"
            : assn
              ? "assigned"
              : "pool";
    return {
      videoId: v.videoId,
      displayCode: v.displayCode,
      pairLabel: assn?.label ?? null,
      waveNo: assn?.waveNo ?? null,
      submittedCount: submitted,
      stage,
      sid: v.sid,
      arm: v.arm,
      teacher: v.teacher,
    };
  });

  const totals = {
    codable: rows.length,
    pool: 0,
    assigned: 0,
    one_submitted: 0,
    ready_to_calibrate: 0,
    calibrated: 0,
  };
  for (const r of rows) totals[r.stage]++;
  return { totals, rows };
}

/* ---------------------------- reliability ----------------------------- */

export interface ReliabilityView extends ReliabilitySummary {
  /** Names for the per-coder table (admin surface). */
  coderNames: Record<string, string>;
  /** Rubric item names for the per-item table. */
  itemNames: Record<number, string>;
}

/**
 * Reliability statistics (addendum §9) over every SIGNED live calibration:
 * anchor vs enumerator individual scores per item, and each coder's signed
 * deviation from the consensus. Computed here from the immutable
 * calibration items; the arithmetic lives in lib/reliability.ts (tested).
 */
export async function getReliabilityStats(): Promise<ReliabilityView> {
  const a = alias(scores, "a");
  const b = alias(scores, "b");
  const oa = alias(observations, "oa");
  const ob = alias(observations, "ob");
  const rows = await db
    .select({
      videoId: calibrationSessions.videoId,
      itemNo: calibrationItems.itemNo,
      finalScore: calibrationItems.finalScoreNum,
      anchorScore: a.scoreNum,
      enumeratorScore: b.scoreNum,
      anchorId: oa.coderId,
      enumeratorId: ob.coderId,
    })
    .from(calibrationItems)
    .innerJoin(calibrationSessions, eq(calibrationSessions.id, calibrationItems.sessionId))
    .innerJoin(a, eq(a.id, calibrationItems.coderAScoreId))
    .innerJoin(b, eq(b.id, calibrationItems.coderBScoreId))
    .innerJoin(oa, eq(oa.id, a.observationId))
    .innerJoin(ob, eq(ob.id, b.observationId))
    .where(
      and(
        eq(calibrationSessions.dataset, "live"),
        eq(calibrationSessions.status, "completed"),
      ),
    );

  const records: CalibrationRecord[] = rows.map((r) => ({
    itemNo: r.itemNo,
    anchorId: r.anchorId,
    enumeratorId: r.enumeratorId,
    anchorScore: r.anchorScore,
    enumeratorScore: r.enumeratorScore,
    finalScore: r.finalScore,
  }));
  const summary = summarizeReliability(records, new Set(rows.map((r) => r.videoId)).size);

  const coderIds = [...new Set(rows.flatMap((r) => [r.anchorId, r.enumeratorId]))];
  const people = coderIds.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, coderIds))
    : [];
  const coderNames = Object.fromEntries(people.map((p) => [p.id, p.name ?? p.email]));

  const [rubric] = await db
    .select({ id: rubricVersions.id })
    .from(rubricVersions)
    .orderBy(sql`${rubricVersions.effectiveFrom} DESC NULLS LAST`)
    .limit(1);
  const concepts = rubric
    ? await db
        .select({ itemNo: rubricConcepts.itemNo, name: rubricConcepts.name })
        .from(rubricConcepts)
        .where(eq(rubricConcepts.rubricVersionId, rubric.id))
    : [];
  const itemNames = Object.fromEntries(concepts.map((c) => [c.itemNo, c.name]));

  return { ...summary, coderNames, itemNames };
}

/* --------------------------- video locks (§45) -------------------------- */

export interface ActiveLockRow {
  id: string;
  coderId: string;
  coderName: string;
  videoId: string;
  displayCode: string;
  startedAt: Date;
  dataset: string;
}

/** Every coder currently holding a started video. */
export async function listActiveLocks(): Promise<ActiveLockRow[]> {
  const rows = await db
    .select({
      id: videoLocks.id,
      coderId: videoLocks.coderId,
      name: users.name,
      email: users.email,
      videoId: videoLocks.videoId,
      displayCode: videos.displayCode,
      startedAt: videoLocks.startedAt,
      dataset: videoLocks.dataset,
    })
    .from(videoLocks)
    .innerJoin(users, eq(users.id, videoLocks.coderId))
    .innerJoin(videos, eq(videos.id, videoLocks.videoId))
    .where(isNull(videoLocks.releasedAt))
    .orderBy(asc(videoLocks.startedAt));
  return rows.map((r) => ({
    id: r.id,
    coderId: r.coderId,
    coderName: r.name ?? r.email,
    videoId: r.videoId,
    displayCode: r.displayCode,
    startedAt: r.startedAt,
    dataset: r.dataset,
  }));
}

/**
 * Release a coder's lock with a reason (broken link, swapped video, coder
 * away). The observation and everything typed stay exactly as they are;
 * open sittings on that video end as 'admin_released'. Audited.
 */
export async function releaseVideoLock(
  actorId: string,
  lockId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) return { ok: false, error: "A reason is required; it is written into the audit log." };
  const [lock] = await db
    .select({ id: videoLocks.id, coderId: videoLocks.coderId, videoId: videoLocks.videoId, releasedAt: videoLocks.releasedAt })
    .from(videoLocks)
    .where(eq(videoLocks.id, lockId));
  if (!lock) return { ok: false, error: "That lock no longer exists." };
  if (lock.releasedAt) return { ok: false, error: "That lock was already released." };
  const now = new Date();
  await db
    .update(videoLocks)
    .set({ releasedAt: now, releasedBy: actorId, releaseReason: trimmed })
    .where(eq(videoLocks.id, lockId));
  await db
    .update(sectionSessions)
    .set({ endedAt: now, endReason: "admin_released" })
    .where(
      and(
        eq(sectionSessions.coderId, lock.coderId),
        eq(sectionSessions.videoId, lock.videoId),
        isNull(sectionSessions.endedAt),
      ),
    );
  await db.insert(auditLog).values({
    actorId,
    action: "video_lock_released",
    subjectTable: "video_locks",
    subjectId: lockId,
    details: { coderId: lock.coderId, videoId: lock.videoId, reason: trimmed },
  });
  return { ok: true };
}

/* ------------------------- video problems (§48) ------------------------- */

export interface VideoProblemRow {
  videoId: string;
  displayCode: string;
  reason: string;
  reportedAt: Date;
  reportedBy: string;
  /** Unblinded (admin surface). */
  sid: string;
  rawFilename: string;
  driveUrl: string | null;
}

export async function listVideoProblems(): Promise<VideoProblemRow[]> {
  const rows = await db
    .select({
      videoId: videos.id,
      displayCode: videos.displayCode,
      reason: videos.unusableReason,
      reportedAt: videos.unusableFlaggedAt,
      name: users.name,
      email: users.email,
      sid: videoProvenance.sid,
      rawFilename: videoProvenance.rawFilename,
      driveUrl: videos.driveUrl,
    })
    .from(videos)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .leftJoin(users, eq(users.id, videos.unusableFlaggedBy))
    .where(and(eq(videos.dataset, "live"), isNotNull(videos.unusableFlaggedAt)))
    .orderBy(asc(videos.unusableFlaggedAt));
  return rows.map((r) => ({
    videoId: r.videoId,
    displayCode: r.displayCode,
    reason: r.reason ?? "",
    reportedAt: r.reportedAt!,
    reportedBy: r.name ?? r.email ?? "unknown",
    sid: r.sid,
    rawFilename: r.rawFilename,
    driveUrl: r.driveUrl,
  }));
}

/** The problem is fixed (link corrected, file swapped): clear the flag, audited. */
export async function clearVideoProblem(
  actorId: string,
  videoId: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = note.trim();
  if (trimmed.length < 3) return { ok: false, error: "Say what was done (it goes to the audit log)." };
  const [v] = await db
    .select({ id: videos.id, reason: videos.unusableReason })
    .from(videos)
    .where(and(eq(videos.id, videoId), isNotNull(videos.unusableFlaggedAt)));
  if (!v) return { ok: false, error: "No open problem on that video." };
  await db
    .update(videos)
    .set({ unusableReason: null, unusableFlaggedBy: null, unusableFlaggedAt: null })
    .where(eq(videos.id, videoId));
  await db.insert(auditLog).values({
    actorId,
    action: "video_problem_cleared",
    subjectTable: "videos",
    subjectId: videoId,
    details: { reportedReason: v.reason, resolution: trimmed },
  });
  return { ok: true };
}

/* --------------------------- weekly outlook --------------------------- */

export interface WeekOutlook {
  weekLabel: string;
  weekStart: string; // yyyy-mm-dd (Monday)
  /** Videos the team could complete: Σ availability (videos/day × 5 working
   *  days) across active live coders, halved because every video takes two. */
  expected: number;
  /** Calibrations signed within the week. */
  actual: number;
}

/** The study's weeks to the (movable) deadline. NOT currently shown —
 *  María removed the road chart 2026-09-01; this feeds the future weekly
 *  calendar idea (docs/07 #1) when it returns. */
export async function getWeeklyOutlook(): Promise<WeekOutlook[]> {
  const team = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.datasetScope, "live")));
  const members = team.filter((t) => !t.email.endsWith("@example.invalid"));
  const memberIds = members.map((m) => m.id);

  const avail = await db
    .select({
      userId: coderAvailability.userId,
      videosPerDay: coderAvailability.videosPerDay,
      effectiveFrom: coderAvailability.effectiveFrom,
      effectiveTo: coderAvailability.effectiveTo,
      createdAt: coderAvailability.createdAt,
    })
    .from(coderAvailability)
    .orderBy(desc(coderAvailability.createdAt));

  const completed = await db
    .select({ completedAt: calibrationSessions.completedAt })
    .from(calibrationSessions)
    .where(
      and(
        eq(calibrationSessions.dataset, "live"),
        eq(calibrationSessions.status, "completed"),
      ),
    );

  const vpdAt = (userId: string, at: Date): number => {
    for (const a of avail) {
      if (a.userId !== userId) continue;
      if (a.effectiveFrom > at) continue;
      if (a.effectiveTo && a.effectiveTo < at) continue;
      return a.videosPerDay;
    }
    return 3;
  };

  // Mondays from the study window start to the deadline week.
  const start = new Date("2026-08-31T12:00:00Z"); // Monday of the first week
  const deadline = new Date("2026-10-30T12:00:00Z");
  const weeks: WeekOutlook[] = [];
  for (
    let monday = new Date(start);
    monday <= deadline;
    monday.setUTCDate(monday.getUTCDate() + 7)
  ) {
    const midWeek = new Date(monday);
    midWeek.setUTCDate(midWeek.getUTCDate() + 2);
    const capacity = memberIds.reduce((sum, id) => sum + vpdAt(id, midWeek) * 5, 0);
    const weekEnd = new Date(monday);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const actual = completed.filter(
      (c) => c.completedAt && c.completedAt >= monday && c.completedAt < weekEnd,
    ).length;
    weeks.push({
      weekLabel: monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      weekStart: monday.toISOString().slice(0, 10),
      expected: Math.round(capacity / 2),
      actual,
    });
  }
  return weeks;
}
