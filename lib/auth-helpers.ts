/**
 * Server-side access guards. Enforcement lives HERE (and in the query
 * layers), in the Node runtime — never in UI hiding, never only in
 * middleware (CLAUDE.md §2).
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getActiveTeams } from "@/lib/db/teams";
import {
  canAccessNarratives,
  canAccessScoring,
  homePathFor,
} from "@/lib/teams";

/** Any signed-in, active account. Redirects to /signin otherwise. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

/** Admin only. Signed-in non-admins land back on the home page. */
export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/");
  return session;
}

/** Any signed-in account plus its active teams. */
export async function requireSessionWithTeams() {
  const session = await requireSession();
  const teams = await getActiveTeams(session.user.id);
  return { session, teams };
}

/** Scoring screens (Amendment §50). Others are sent to their own home. */
export async function requireScoringAccess() {
  const { session, teams } = await requireSessionWithTeams();
  if (!canAccessScoring(session.user.role, teams)) {
    redirect(homePathFor(session.user.role, teams));
  }
  return { session, teams };
}

/** The Narratives workspace (Amendment §51). */
export async function requireNarrativesAccess() {
  const { session, teams } = await requireSessionWithTeams();
  if (!canAccessNarratives(session.user.role, teams)) {
    redirect(homePathFor(session.user.role, teams));
  }
  return { session, teams };
}
