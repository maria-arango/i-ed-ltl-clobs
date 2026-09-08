/**
 * "My videos" in the simple interface: one big card per assigned video,
 * the started one first, then the ones waiting, then the finished. Server
 * component reading through the restricted coder layer for `coderId`, so
 * the admin preview can render it for any account.
 */
import Link from "next/link";
import { getActiveLock, getCoderQueue } from "@/lib/db/coder";
import { getCalibrationQueue } from "@/lib/db/coder-calibration";

function StatusWord({ status }: { status: string | null }) {
  const map: Record<string, { bg: string; fg: string; text: string }> = {
    submitted: { bg: "var(--clobs-forest-wash)", fg: "var(--clobs-forest)", text: "Done" },
    in_progress: { bg: "var(--clobs-lake-wash)", fg: "var(--clobs-lake)", text: "In progress" },
  };
  const s = (status && map[status]) || { bg: "var(--clobs-sunken)", fg: "var(--clobs-graphite)", text: "Not started" };
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-[13px] font-medium" style={{ background: s.bg, color: s.fg }}>
      {s.text}
    </span>
  );
}

export async function SimpleWeekList({
  coderId,
  showCalibration,
  base = "/s",
  readOnly = false,
}: {
  coderId: string;
  showCalibration: boolean;
  /** Link prefix (the admin preview points links nowhere). */
  base?: string;
  readOnly?: boolean;
}) {
  const [queue, lock, calibration] = await Promise.all([
    getCoderQueue(coderId),
    getActiveLock(coderId),
    showCalibration ? getCalibrationQueue(coderId) : Promise.resolve([]),
  ]);
  const ready = calibration.filter((c) => c.stage === "ready").length;
  const rank = (q: (typeof queue)[number]) =>
    q.videoId === lock?.videoId ? 0 : q.observationStatus === "submitted" ? 2 : 1;
  const ordered = [...queue].sort((a, b) => rank(a) - rank(b) || a.displayCode.localeCompare(b.displayCode));
  const done = queue.filter((q) => q.observationStatus === "submitted").length;

  return (
    <div className="space-y-5">
      <section className="space-y-1">
        <h1
          className="font-serif text-ink"
          style={{ fontSize: "var(--clobs-text-display)", lineHeight: "var(--clobs-leading-display)", letterSpacing: "var(--clobs-tracking-display)" }}
        >
          My videos
        </h1>
        <p className="text-[16px] text-graphite">
          <span className="mono text-ink">{done}</span> of <span className="mono text-ink">{queue.length}</span> finished.
          {lock ? " Finish the started one before opening another." : " Open one to start it."}
        </p>
      </section>

      {showCalibration && ready > 0 && (
        <Link
          href={readOnly ? "#" : "/calibration"}
          className="elev-card card-lift flex items-center justify-between rounded-2xl border border-hairline bg-card p-5"
          style={{ borderColor: "var(--clobs-forest)" }}
        >
          <span className="text-[16px] text-ink">
            {ready} video{ready === 1 ? "" : "s"} ready to calibrate with your partner
          </span>
          <span aria-hidden className="text-[20px] text-forest">→</span>
        </Link>
      )}

      {ordered.length === 0 && (
        <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
          <p className="text-[16px] text-graphite">No videos yet. Your list fills when your admin runs an assignment.</p>
        </div>
      )}

      <ul className="space-y-3">
        {ordered.map((q) => {
          const isLocked = !!lock && lock.videoId !== q.videoId && q.observationStatus !== "submitted";
          const isStarted = lock?.videoId === q.videoId;
          const inner = (
            <>
              <div className="min-w-0">
                <p className="video-code text-[22px] leading-none text-ink">{q.displayCode}</p>
                <p className="mt-2 text-[14px] text-graphite">
                  {q.partnerName ? `with ${q.partnerName}` : "partner to be assigned"}
                  {isLocked ? " · after the started video" : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <StatusWord status={q.observationStatus} />
                {isStarted && (
                  <span className="text-[12px] font-medium" style={{ color: "var(--clobs-lake)" }}>
                    started
                  </span>
                )}
              </div>
            </>
          );
          const cls = `elev-card flex items-center justify-between gap-4 rounded-2xl border border-hairline bg-card p-5 ${
            isLocked ? "opacity-60" : "card-lift"
          }`;
          return (
            <li key={q.videoId}>
              {readOnly || isLocked ? (
                <div className={cls} aria-disabled={isLocked}>{inner}</div>
              ) : (
                <Link href={`${base}/videos/${q.videoId}`} className={cls}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
