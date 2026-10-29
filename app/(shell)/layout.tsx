/**
 * The (shell) route group: every working screen shares one persistent
 * frame — sidebar and top bar live HERE, so navigating between sections
 * animates only the content pane (see template.tsx), never the chrome.
 */
import { requireScoringAccess } from "@/lib/auth-helpers";
import { getCoderQueue } from "@/lib/db/coder";
import { getCalibrationQueue } from "@/lib/db/coder-calibration";
import { AppShell } from "@/components/app-shell";

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, teams } = await requireScoringAccess();
  // Sidebar badges: what is waiting for this person right now.
  const [queue, calibration] = await Promise.all([
    getCoderQueue(session.user.id),
    getCalibrationQueue(session.user.id),
  ]);
  const badges = {
    newVideos: queue.filter((q) => q.observationStatus === null).length,
    calibrationsReady: calibration.filter((c) => c.stage === "ready").length,
  };
  return (
    <AppShell
      email={session.user.email}
      name={session.user.name}
      role={session.user.role}
      showMyNarratives={teams.includes("narratives")}
      isChiefCoder={session.user.isChiefCoder}
      showCalibration={session.user.datasetScope !== "training"}
      badges={badges}
    >
      {children}
    </AppShell>
  );
}
