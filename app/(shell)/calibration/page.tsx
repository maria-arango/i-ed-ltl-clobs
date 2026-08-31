/**
 * Calibration — the coder's list of shared videos and where each stands
 * on the way to a signed consensus. Server component; restricted layer only.
 */
import Link from "next/link";
import { requireSession } from "@/lib/auth-helpers";
import { getCalibrationQueue, type CalibrationStage } from "@/lib/db/coder-calibration";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

        <p className="text-[14px] leading-[1.6] text-graphite">
          Once you and your partner have both submitted individual scores for
          a video, open its room below at the same time (in person or on a
          call) and agree on a final score for each concept. Your submitted
          scores stay locked on record.
        </p>

        {queue.length === 0 ? (
          <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
            <p className="text-[15px] text-graphite">
              Nothing to calibrate yet. This list fills as you and your
              partner submit scores for shared videos.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Video</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((row) => (
                <TableRow key={row.videoId}>
                  <TableCell>
                    <span className="video-code text-[14px] text-ink">
                      {row.displayCode}
                    </span>
                  </TableCell>
                  <TableCell className="text-graphite">
                    {row.partnerName ?? "—"}
                  </TableCell>
                  <TableCell className={STAGE_CLASS[row.stage]}>
                    {STAGE_LABEL[row.stage]}
                  </TableCell>
                  <TableCell className="text-right">
                    {(row.stage === "ready" || row.stage === "completed") && (
                      <Link
                        href={`/calibration/${row.videoId}`}
                        className="rounded-sm text-[14px] text-lake underline-offset-4 hover:underline"
                      >
                        {row.stage === "ready" ? "Enter room" : "View record"}
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
  );
}
