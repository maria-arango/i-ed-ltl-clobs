/**
 * The Narratives screens (Amendment §51) live in the same application frame
 * as every other screen: the cream sidebar shell, the same top bar, the same
 * design system. Each page enforces its own access rule server-side.
 */
import { requireSessionWithTeams } from "@/lib/auth-helpers";
import { canAccessScoring } from "@/lib/teams";
import { AppShell } from "@/components/app-shell";
import { hasOpenNarratives } from "@/lib/db/narratives";

export default async function NarrativesAreaLayout({ children }: { children: React.ReactNode }) {
  const { session, teams } = await requireSessionWithTeams();
  const isAdmin = session.user.role === "admin";
  return (
    <AppShell
      email={session.user.email}
      name={session.user.name}
      role={session.user.role}
      isChiefCoder={session.user.isChiefCoder}
      showCalibration={session.user.datasetScope !== "training"}
      showScoring={isAdmin || (teams.length > 0 && canAccessScoring(session.user.role, teams))}
      showMyNarratives={teams.includes("narratives") || (session.user.role === "admin" && (await hasOpenNarratives(session.user.id)))}
    >
      {children}
    </AppShell>
  );
}
