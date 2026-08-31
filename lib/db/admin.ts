/**
 * ADMIN query layer — full-role queries for admin-facing surfaces.
 * Import ONLY from admin-facing code paths (the ESLint boundary keeps it
 * out of coder routes). Every function assumes the caller has already run
 * requireAdmin().
 */
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { observations, users, videos } from "@/db/schema";

export interface AdminHomeStats {
  codableVideos: number;
  assignedVideos: number;
  completedVideos: number;
  submittedObservations: number;
  activeCoders: number;
}

/** Study-wide counts for the home page (live dataset only). */
export async function getAdminHomeStats(): Promise<AdminHomeStats> {
  const [codable] = await db
    .select({ n: count() })
    .from(videos)
    .where(and(eq(videos.dataset, "live"), ne(videos.status, "void")));
  const [assigned] = await db
    .select({ n: count() })
    .from(videos)
    .where(and(eq(videos.dataset, "live"), eq(videos.status, "assigned")));
  const [complete] = await db
    .select({ n: count() })
    .from(videos)
    .where(and(eq(videos.dataset, "live"), eq(videos.status, "complete")));
  const [submitted] = await db
    .select({ n: count() })
    .from(observations)
    .where(
      and(eq(observations.dataset, "live"), eq(observations.status, "submitted")),
    );
  const [coders] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.isActive, true));

  return {
    codableVideos: Number(codable.n),
    assignedVideos: Number(assigned.n),
    completedVideos: Number(complete.n),
    submittedObservations: Number(submitted.n),
    activeCoders: Number(coders.n),
  };
}
