/**
 * Home — the coder's landing page. One composed progress object (the
 * completion bar) instead of a stat-card grid; the queue as a worklist;
 * for admins, the study figures as a single hairline strip with the door
 * into Team. Quiet, per DESIGN_SYSTEM ("Operate" surface).
 */
import Link from "next/link";
import { requireSession } from "@/lib/auth-helpers";
import { getCoderQueue } from "@/lib/db/coder";
import { getAdminHomeStats } from "@/lib/db/admin";
import { NumberTicker } from "@/components/ui/number-ticker";
import { StatusPill } from "@/components/ui/status-pill";

function formatToday(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default async function Home() {
  const session = await requireSession();
  const { user } = session;
  const firstName = user.name?.split(" ")[0] ?? user.email?.split("@")[0];

  const queue = await getCoderQueue(user.id);
  const done = queue.filter((q) => q.observationStatus === "submitted").length;
  const inProgress = queue.filter(
    (q) => q.observationStatus === "in_progress",
  ).length;
  const cardsToFill = queue.filter(
    (q) => q.fillsContextCard && q.observationStatus !== "submitted",
  ).length;
  const worklist = queue
    .filter((q) => q.observationStatus !== "submitted")
    .slice(0, 6);
  const pct = queue.length === 0 ? 0 : Math.round((done / queue.length) * 100);

  const adminStats = user.role === "admin" ? await getAdminHomeStats() : null;

  return (
      <div className="mx-auto mt-2 max-w-[880px] space-y-12">
        {/* Greeting */}
        <section className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h1
            className="font-serif text-ink"
            style={{
              fontSize: "var(--clobs-text-display)",
              lineHeight: "var(--clobs-leading-display)",
              letterSpacing: "var(--clobs-tracking-display)",
            }}
          >
            Welcome back, {firstName}.
          </h1>
          <span className="mono text-[12px] text-smoke">{formatToday()}</span>
        </section>

        {/* Progress — one composed object, not a card grid */}
        <section aria-label="My progress" className="space-y-3">
          {queue.length === 0 ? (
            <div className="elev-card rounded-xl border border-hairline bg-card p-6">
              <p
                className="font-serif text-ink"
                style={{
                  fontSize: "var(--clobs-text-prose-lg)",
                  lineHeight: "var(--clobs-leading-prose-lg)",
                }}
              >
                Nothing assigned yet.
              </p>
              <p className="mt-1 text-[14px] leading-[1.55] text-graphite">
                Your queue fills when an assignment wave runs. Until then,
                there is nothing you need to do here.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <p className="text-[15px] text-ink">
                  <NumberTicker value={done} className="font-medium" /> of{" "}
                  <span className="mono font-medium">{queue.length}</span>{" "}
                  observations complete
                  {inProgress > 0 && (
                    <span className="text-graphite">
                      {" "}
                      · {inProgress} in progress
                    </span>
                  )}
                  {cardsToFill > 0 && (
                    <span className="text-graphite">
                      {" "}
                      · {cardsToFill} context card
                      {cardsToFill === 1 ? "" : "s"} waiting on you
                    </span>
                  )}
                </p>
                <Link
                  href="/videos"
                  className="rounded-sm text-[14px] text-lake underline underline-offset-4"
                >
                  All my videos →
                </Link>
              </div>
              <div
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${done} of ${queue.length} observations complete`}
                className="h-2 overflow-hidden rounded-full bg-sunken"
              >
                <div
                  className="h-full rounded-full bg-bark"
                  style={{ width: `${Math.max(pct, done > 0 ? 4 : 0)}%` }}
                />
              </div>

              {worklist.length > 0 ? (
                <ul className="elev-card divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
                  {worklist.map((row) => (
                    <li key={row.videoId}>
                      <Link
                        href={`/videos/${row.videoId}`}
                        className="flex h-11 items-center gap-4 px-4 transition-colors duration-[90ms] hover:bg-card"
                      >
                        <span className="video-code w-24 text-[14px] text-ink">
                          {row.displayCode}
                        </span>
                        <span className="flex-1 text-[13px] text-graphite">
                          {row.fillsContextCard
                            ? "You fill the context card"
                            : ""}
                        </span>
                        <StatusPill status={row.observationStatus} />
                        <span aria-hidden className="text-[14px] text-lake">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] text-graphite">
                  Everything in your queue is complete. Well done.
                </p>
              )}
            </>
          )}
        </section>

        {/* Admin: one hairline strip, not a card grid */}
        {adminStats && (
          <section aria-label="Study overview" className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2
                className="font-sans font-medium text-ink"
                style={{
                  fontSize: "var(--clobs-text-heading-sm)",
                  lineHeight: "var(--clobs-leading-heading-sm)",
                  letterSpacing: "var(--clobs-tracking-heading-sm)",
                }}
              >
                Study overview
              </h2>
              <span className="text-[12px] text-smoke">
                Team and Assignment live in the sidebar
              </span>
            </div>
            <dl className="grid grid-cols-2 divide-hairline overflow-hidden rounded-lg border border-hairline bg-card sm:grid-cols-4 sm:divide-x">
              {[
                { n: adminStats.codableVideos, label: "codable videos" },
                { n: adminStats.assignedVideos, label: "currently assigned" },
                {
                  n: adminStats.submittedObservations,
                  label: "observations submitted",
                },
                { n: adminStats.activeCoders, label: "active accounts" },
              ].map((s) => (
                <div key={s.label} className="px-4 py-3">
                  <dt className="text-[12px] text-smoke">{s.label}</dt>
                  <dd className="mt-0.5 text-[20px] leading-[1.3] text-ink">
                    <NumberTicker value={s.n} />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-[12px] text-smoke">
              Study progress and charts live under{" "}
              <Link
                href="/admin/progress"
                className="rounded-sm text-lake underline underline-offset-4"
              >
                Progress
              </Link>
              ; reliability statistics and the AI-training exports are the
              next build.
            </p>
            {user.email?.toLowerCase() === "maria_oteroarango@gse.harvard.edu" && (
              <Link
                href="/admin/preview"
                className="inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-paper px-4 py-2 text-[13px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
              >
                What Arya can see →
              </Link>
            )}
          </section>
        )}

      </div>
  );
}
