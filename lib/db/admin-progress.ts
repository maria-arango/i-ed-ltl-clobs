/**
 * Study progress (ADMIN-ONLY): where every codable video stands on the
 * path pool → assigned → scored twice → calibrated. Feeds the Progress
 * dashboard's insight cards and its filterable table.
 */
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignments,
  calibrationSessions,
  observations,
  pairs,
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
