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

/* ------------------------------------------------------------------ */
/* Team management (the Team screen)                                   */
/* ------------------------------------------------------------------ */

import { asc } from "drizzle-orm";
import { auditLog } from "@/db/schema";

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "coder";
  isChiefCoder: boolean;
  datasetScope: "live" | "test" | "training";
  isActive: boolean;
  createdAt: Date;
}

export async function listTeam(): Promise<TeamMember[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isChiefCoder: users.isChiefCoder,
      datasetScope: users.datasetScope,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
}

async function audit(
  actorId: string,
  action: string,
  subjectId: string,
  details: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    actorId,
    action,
    subjectTable: "users",
    subjectId,
    details,
  });
}

/**
 * Add a teammate. From this moment that email can sign in — there is no
 * self-signup, so this is the ONLY way in (addendum §2, Amendment B §2).
 */
export async function addTeamMember(
  actorId: string,
  input: {
    email: string;
    name: string | null;
    role: "admin" | "coder";
    isChiefCoder: boolean;
    isTrainee: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That does not look like an email address." };
  }
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: "That email is already on the team." };
  }
  await db.insert(users).values({
    email,
    name: input.name?.trim() || null,
    role: input.role,
    isChiefCoder: input.role === "coder" ? input.isChiefCoder : false,
    datasetScope: input.isTrainee ? "training" : "live",
  });
  await audit(actorId, "team_member_added", email, {
    role: input.role,
    chief: input.isChiefCoder,
    trainee: input.isTrainee,
  });
  return { ok: true };
}

/** Deactivate (blocks sign-in, preserves all work) or reactivate. */
export async function setMemberActive(
  actorId: string,
  userId: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (userId === actorId && !active) {
    return { ok: false, error: "You cannot deactivate your own account." };
  }
  await db
    .update(users)
    .set({
      isActive: active,
      deactivatedAt: active ? null : new Date(),
      deactivatedReason: active ? null : "Deactivated from the Team screen",
    })
    .where(eq(users.id, userId));
  await audit(actorId, active ? "team_member_reactivated" : "team_member_deactivated", userId, {});
  return { ok: true };
}

/** Toggle the chief-coder flag (coders only — Amendment B §2 anchors). */
export async function setChiefCoder(
  actorId: string,
  userId: string,
  isChief: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) return { ok: false, error: "No such account." };
  if (rows[0].role !== "coder") {
    return { ok: false, error: "Only coder accounts carry the chief flag." };
  }
  await db.update(users).set({ isChiefCoder: isChief }).where(eq(users.id, userId));
  await audit(actorId, isChief ? "chief_coder_granted" : "chief_coder_removed", userId, {});
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Roles, deletion, availability (Amendment B §18–20)                  */
/* ------------------------------------------------------------------ */

import {
  assignmentRaters as assignmentRatersT,
  coderAvailability,
  observations as observationsT,
} from "@/db/schema";
import { desc, isNull, sql } from "drizzle-orm";

/** Promote a coder to admin or demote an admin to coder. */
export async function setMemberRole(
  actorId: string,
  userId: string,
  role: "admin" | "coder",
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (userId === actorId && role !== "admin") {
    return { ok: false, error: "You cannot demote your own account." };
  }
  await db
    .update(users)
    .set({ role, isChiefCoder: role === "admin" ? false : undefined })
    .where(eq(users.id, userId));
  await audit(actorId, role === "admin" ? "member_promoted_to_admin" : "member_demoted_to_coder", userId, {});
  return { ok: true };
}

/**
 * Permanent deletion — ONLY for accounts with no work (Amendment B §20).
 * Anything evidentiary keeps CLAUDE.md §7: deactivate instead.
 */
export async function deleteMemberPermanently(
  actorId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (userId === actorId) {
    return { ok: false, error: "You cannot delete your own account." };
  }
  const [target] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) return { ok: false, error: "No such account." };

  const blockers: string[] = [];
  const [{ n: obs }] = await db
    .select({ n: count() })
    .from(observationsT)
    .where(eq(observationsT.coderId, userId));
  if (Number(obs) > 0) blockers.push("observations");
  const [{ n: raters }] = await db
    .select({ n: count() })
    .from(assignmentRatersT)
    .where(eq(assignmentRatersT.userId, userId));
  if (Number(raters) > 0) blockers.push("assignments");
  const [{ n: authored }] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(eq(auditLog.actorId, userId));
  if (Number(authored) > 0) blockers.push("admin actions");
  const [{ n: memberships }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sql`pair_members`)
    .where(sql`pair_members.user_id = ${userId}`);
  if (Number(memberships) > 0) blockers.push("pair history");

  if (blockers.length > 0) {
    return {
      ok: false,
      error: `This account has ${blockers.join(", ")} on record and cannot be deleted. Deactivate it instead.`,
    };
  }

  await db.delete(coderAvailability).where(eq(coderAvailability.userId, userId));
  await db.delete(users).where(eq(users.id, userId)); // sessions/accounts cascade
  await audit(actorId, "member_deleted_permanently", target.email, {});
  return { ok: true };
}

export interface AvailabilityView {
  videosPerDay: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** Current availability per user (the open or latest entry). */
export async function getAvailabilityMap(): Promise<Record<string, AvailabilityView>> {
  const rows = await db
    .select({
      userId: coderAvailability.userId,
      videosPerDay: coderAvailability.videosPerDay,
      effectiveFrom: coderAvailability.effectiveFrom,
      effectiveTo: coderAvailability.effectiveTo,
    })
    .from(coderAvailability)
    .orderBy(desc(coderAvailability.createdAt));
  const map: Record<string, AvailabilityView> = {};
  for (const r of rows) {
    if (!map[r.userId]) map[r.userId] = r; // newest first
  }
  return map;
}

/**
 * Set availability from a given date: closes the open entry (history is
 * preserved, never edited) and starts a new one.
 */
export async function setAvailability(
  actorId: string,
  userId: string,
  videosPerDay: number,
  effectiveFrom: Date,
  effectiveTo: Date | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(videosPerDay >= 0 && videosPerDay <= 6)) {
    return { ok: false, error: "Videos per day must be between 0 and 6." };
  }
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return { ok: false, error: "The end date is before the start date." };
  }
  await db
    .update(coderAvailability)
    .set({ effectiveTo: effectiveFrom })
    .where(and(eq(coderAvailability.userId, userId), isNull(coderAvailability.effectiveTo)));
  await db.insert(coderAvailability).values({
    userId,
    videosPerDay,
    fteFraction: Math.round((videosPerDay / 3) * 100),
    effectiveFrom,
    effectiveTo,
  });
  await audit(actorId, "availability_set", userId, {
    videosPerDay,
    from: effectiveFrom.toISOString().slice(0, 10),
    to: effectiveTo?.toISOString().slice(0, 10) ?? null,
  });
  return { ok: true };
}
