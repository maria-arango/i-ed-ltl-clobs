/**
 * Team membership reads, through the RESTRICTED coder connection so that
 * coder-facing guards (lib/coder-route.ts, lib/auth-helpers.ts) never need
 * the admin client. Writes live in lib/db/admin.ts.
 */
import { and, eq, isNull } from "drizzle-orm";
import { userTeams } from "@/db/schema";
import { coderDb } from "@/lib/db/coder";
import type { Team } from "@/lib/teams";

/** Active teams of one account, read fresh on every call (a removal takes
 *  effect on the next request, not at the next sign-in). */
export async function getActiveTeams(userId: string): Promise<Team[]> {
  const rows = await coderDb
    .select({ team: userTeams.team })
    .from(userTeams)
    .where(and(eq(userTeams.userId, userId), isNull(userTeams.removedAt)));
  return rows.map((r) => r.team);
}
