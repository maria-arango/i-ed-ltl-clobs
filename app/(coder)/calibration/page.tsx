/**
 * Calibration — the coder's list of shared videos and where each stands
 * on the way to a signed consensus. Server component; restricted layer only.
 */
import Link from "next/link";
import { requireSession } from "@/lib/auth-helpers";
import { getCalibrationQueue, type CalibrationStage } from "@/lib/db/coder-calibration";
import { AppShell } from "@/components/app-shell";

const STAGE_LABEL: Record<CalibrationStage, string> = {
  code_first: "Finish your own scoring first",
  waiting_partner: "Waiting for your partner to submit",
  ready: "Ready to calibrate",
  completed: "Calibrated",
};

const STAGE_CLASS: Record<CalibrationStage, string> = {
  code_first: "text-smoke",
  waiting_partner: "text-graphite",
  ready: "text-lake",
  completed: "text-ink",
};

export default async function CalibrationQueue() {
  const session = await requireSession();
  const queue = await getCalibrationQueue(session.user.id);
  const done = queue.filter((q) => q.stage === "completed").length;
  const ready = queue.filter((q) => q.stage === "ready").length;

  return (
    <AppShell
      email={session.user.email}
      role={session.user.role}
      isChiefCoder={session.user.isChiefCoder}
    >
      <div className="space-y-6">
        <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
          <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
            Home
          </Link>
          <span aria-hidden> / </span>
          <span className="text-graphite">Calibration</span>
        </nav>

        <header className="flex items-baseline justify-between">
          <h1
            className="font-sans font-medium text-ink"
            style={{
              fontSize: "var(--clobs-text-heading)",
              lineHeight: "var(--clobs-leading-heading)",
              letterSpacing: "var(--clobs-tracking-heading)",
            }}
          >
            Calibration
          </h1>
          <p className="text-[14px] text-smoke">
            <span className="mono">{done}</span> of{" "}
            <span className="mono">{queue.length}</span> calibrated
            {ready > 0 && (
              <>
                {" "}
                · <span className="mono">{ready}</span> ready
              </>
            )}
          </p>
        </header>

        <p className="max-w-[64ch] text-[14px] leading-[1.6] text-graphite">
          Once you and your partner have both submitted your individual
          scores for a video, meet (in person or on a call), open its room
          below at the same time, and agree on a final score for each
          concept. Your individual scores are locked and stay on record.
        </p>

        {queue.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-card p-6">
            <p className="text-[15px] text-graphite">
              Nothing to calibrate yet. This list fills as you and your
              partner submit scores for shared videos.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead>
                <tr className="bg-sunken text-[12px] text-graphite">
                  <th className="px-4 py-2 font-semibold">Video</th>
                  <th className="px-4 py-2 font-semibold">Partner</th>
                  <th className="px-4 py-2 font-semibold">Stage</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => (
                  <tr
                    key={row.videoId}
                    className="h-10 border-t border-hairline transition-colors duration-[90ms] hover:bg-card"
                  >
                    <td className="px-4">
                      <span className="video-code text-[14px] text-ink">
                        {row.displayCode}
                      </span>
                    </td>
                    <td className="px-4 text-graphite">{row.partnerName ?? "—"}</td>
                    <td className={`px-4 ${STAGE_CLASS[row.stage]}`}>
                      {STAGE_LABEL[row.stage]}
                    </td>
                    <td className="px-4 text-right">
                      {(row.stage === "ready" || row.stage === "completed") && (
                        <Link
                          href={`/calibration/${row.videoId}`}
                          className="rounded-sm text-[14px] text-lake underline-offset-4 hover:underline"
                        >
                          {row.stage === "ready" ? "Enter room" : "View record"}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
