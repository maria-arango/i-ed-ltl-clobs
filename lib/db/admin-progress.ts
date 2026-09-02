/**
 * Study progress (ADMIN-ONLY): where every codable video stands on the
 * path pool → assigned → scored twice → calibrated. Feeds the Progress
 * dashboard's insight cards and its filterable table.
 */
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignments,
  calibrationSessions,
  coderAvailability,
  observations,
  pairs,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";

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
