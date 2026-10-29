/**
 * The Narratives area (Amendment §51): the enumerator workspace
 * (/narratives) and the admin dashboard (/admin/narratives) share this
 * plain frame. Each page enforces its own access rule server-side.
 */
import { requireSessionWithTeams } from "@/lib/auth-helpers";
import { NxTopbar } from "@/components/narratives/nx-topbar";

export default async function NarrativesAreaLayout({ children }: { children: React.ReactNode }) {
  const { session, teams } = await requireSessionWithTeams();
  return (
    <div className="nx-area min-h-screen">
      <NxTopbar
        displayName={session.user.name || session.user.email || "Unknown"}
        role={session.user.role}
        teams={teams}
      />
      {children}
    </div>
  );
}
