/**
 * "My videos" in the simple interface, in three sections (María, 2026-09-08):
 *   To code            the started video first, then the rest
 *   Ready to calibrate submitted by me; waiting for the partner, or ready
 *                      to sit together — not 100% done yet
 *   Done               calibration signed by both
 * Trainees have no calibration, so their submitted videos are Done.
 * Server component reading through the restricted coder layer for
 * `coderId`, so the admin preview can render it for any account.
 */
import Link from "next/link";
import { getActiveLock, getCoderQueue } from "@/lib/db/coder";
import { getCalibrationQueue } from "@/lib/db/coder-calibration";

function Pill({ text, tone }: { text: string; tone: "done" | "open" | "wait" | "todo" }) {
  const map = {
    done: { bg: "var(--clobs-forest-wash)", fg: "var(--clobs-forest)" },
    open: { bg: "var(--clobs-lake-wash)", fg: "var(--clobs-lake)" },
    wait: { bg: "var(--clobs-sunken)", fg: "var(--clobs-graphite)" },
    todo: { bg: "var(--clobs-sunken)", fg: "var(--clobs-graphite)" },
  }[tone];
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-medium" style={{ background: map.bg, color: map.fg }}>
      {text}
    </span>
  );
}

function SectionTitle({ title, count, hint }: { title: string; count: number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-smoke">
        {title} <span className="mono ml-1 text-graphite">{count}</span>
      </h2>
      {hint && <p className="text-[12px] text-smoke">{hint}</p>}
    </div>
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
  const stageOf = new Map(calibration.map((c) => [c.videoId, c.stage]));

  type Row = (typeof queue)[number];
  const toCode: Row[] = [];
  const toCalibrate: Row[] = [];
  const done: Row[] = [];
  for (const q of queue) {
    if (q.observationStatus !== "submitted") toCode.push(q);
    else if (!showCalibration || stageOf.get(q.videoId) === "completed") done.push(q);
    else toCalibrate.push(q);
  }
  toCode.sort((a, b) => (a.videoId === lock?.videoId ? -1 : b.videoId === lock?.videoId ? 1 : a.displayCode.localeCompare(b.displayCode)));
  const readyCount = toCalibrate.filter((q) => stageOf.get(q.videoId) === "ready").length;

  const card = (q: Row, right: React.ReactNode, sub: string, dimmed: boolean, href: string | null) => {
    const inner = (
      <>
        <div className="min-w-0">
          <p className="video-code text-[22px] leading-none text-ink">{q.displayCode}</p>
          <p className="mt-2 text-[14px] text-graphite">{sub}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">{right}</div>
      </>
    );
    const cls = `elev-card flex items-center justify-between gap-4 rounded-2xl border border-hairline bg-card p-5 ${dimmed ? "opacity-60" : "card-lift"}`;
    return (
      <li key={q.videoId}>
        {readOnly || dimmed || !href ? (
          <div className={cls} aria-disabled={dimmed}>{inner}</div>
        ) : (
          <Link href={href} className={cls}>
            {inner}
          </Link>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-7">
      <section className="space-y-1">
        <h1
          className="font-serif text-ink"
          style={{ fontSize: "var(--clobs-text-display)", lineHeight: "var(--clobs-leading-display)", letterSpacing: "var(--clobs-tracking-display)" }}
        >
          My videos
        </h1>
        <p className="text-[16px] text-graphite">
          <span className="mono text-ink">{done.length}</span> of <span className="mono text-ink">{queue.length}</span> fully done.
          {lock ? " Finish the started one before opening another." : toCode.length ? " Open one to start it." : ""}
        </p>
      </section>

      {queue.length === 0 && (
        <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
          <p className="text-[16px] text-graphite">No videos yet. Your list fills when your admin runs an assignment.</p>
        </div>
      )}

      {toCode.length > 0 && (
        <section className="space-y-3">
          <SectionTitle title="To code" count={toCode.length} />
          <ul className="space-y-3">
            {toCode.map((q) => {
              const isStarted = lock?.videoId === q.videoId;
              const isLocked = !!lock && !isStarted;
              return card(
                q,
                <>
                  <Pill text={q.observationStatus === "in_progress" ? "In progress" : "Not started"} tone={q.observationStatus === "in_progress" ? "open" : "todo"} />
                  {isStarted && (
                    <span className="text-[12px] font-medium" style={{ color: "var(--clobs-lake)" }}>
                      started
                    </span>
                  )}
                </>,
                `${q.partnerName ? `with ${q.partnerName}` : "partner to be assigned"}${isLocked ? " · after the started video" : ""}`,
                isLocked,
                `${base}/videos/${q.videoId}`,
              );
            })}
          </ul>
        </section>
      )}

      {toCalibrate.length > 0 && (
        <section className="space-y-3">
          <SectionTitle
            title="Ready to calibrate"
            count={toCalibrate.length}
            hint={readyCount > 0 ? `${readyCount} can start now` : "waiting for your partner"}
          />
          <ul className="space-y-3">
            {toCalibrate.map((q) => {
              const ready = stageOf.get(q.videoId) === "ready";
              return card(
                q,
                <Pill text={ready ? "Sit together now" : "Partner still coding"} tone={ready ? "open" : "wait"} />,
                `Your scores are in${q.partnerName ? `; calibrate with ${q.partnerName}` : ""}. Not fully done until you both sign.`,
                false,
                ready ? `/calibration/${q.videoId}` : `${base}/videos/${q.videoId}`,
              );
            })}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-3">
          <SectionTitle title="Done" count={done.length} />
          <ul className="space-y-3">
            {done.map((q) =>
              card(
                q,
                <Pill text={showCalibration ? "Calibrated ✓" : "Submitted ✓"} tone="done" />,
                q.partnerName ? `with ${q.partnerName}` : "",
                false,
                `${base}/videos/${q.videoId}`,
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
