/**
 * Home — the coder's landing page: their progress at a glance and the
 * next videos to work on. Admins additionally see a study-overview strip
 * (the full dashboards arrive in build stage 4).
 */
import Link from "next/link";
import { requireSession } from "@/lib/auth-helpers";
import { signOut } from "@/auth";
import { getCoderQueue } from "@/lib/db/coder";
import { getAdminHomeStats } from "@/lib/db/admin";

function InsightCard({
  value,
  label,
  accent,
}: {
  value: string | number;
  label: string;
  accent?: "forest" | "lake";
}) {
  const color =
    accent === "forest"
      ? "var(--clobs-forest)"
      : accent === "lake"
        ? "var(--clobs-lake)"
        : "var(--clobs-ink)";
  return (
    <div className="rounded-xl border border-hairline bg-card p-4">
      <p className="mono text-[26px] leading-[1.25]" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-[13px] text-graphite">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const map: Record<string, { bg: string; fg: string; text: string }> = {
    submitted: {
      bg: "var(--clobs-forest-wash)",
      fg: "var(--clobs-forest)",
      text: "Complete",
    },
    in_progress: {
      bg: "var(--clobs-lake-wash)",
      fg: "var(--clobs-lake)",
      text: "In progress",
    },
  };
  const s = (status && map[status]) || {
    bg: "var(--clobs-sunken)",
    fg: "var(--clobs-graphite)",
    text: "Not started",
  };
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.text}
    </span>
  );
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
  const notStarted = queue.length - done - inProgress;
  const cardsToFill = queue.filter(
    (q) => q.fillsContextCard && q.observationStatus !== "submitted",
  ).length;
  const nextUp = queue
    .filter((q) => q.observationStatus !== "submitted")
    .slice(0, 5);

  const adminStats = user.role === "admin" ? await getAdminHomeStats() : null;

  return (
    <main className="mx-auto min-h-screen max-w-[1440px] bg-paper p-8">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-hairline pb-4">
        <p className="font-serif text-[20px] text-ink">LTL Classroom Observations</p>
        <div className="flex items-center gap-4">
          <span className="hidden text-[13px] text-smoke sm:inline">
            {user.email} · {user.role}
            {user.isChiefCoder ? " · chief coder" : ""}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-hairline-strong bg-paper px-4 py-2 text-[13px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mt-10 space-y-12">
        {/* Greeting */}
        <section>
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
          <p className="mt-2 max-w-[68ch] text-[15px] text-graphite">
            {queue.length === 0
              ? "You have no videos assigned yet — your queue fills when an assignment wave runs."
              : done === queue.length
                ? "Everything in your queue is complete. Well done."
                : `You have ${queue.length - done} video${queue.length - done === 1 ? "" : "s"} to finish.`}
          </p>
        </section>

        {/* My progress */}
        <section aria-label="My progress" className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2
              className="font-sans font-medium text-ink"
              style={{
                fontSize: "var(--clobs-text-heading-sm)",
                lineHeight: "var(--clobs-leading-heading-sm)",
                letterSpacing: "var(--clobs-tracking-heading-sm)",
              }}
            >
              My progress
            </h2>
            <Link
              href="/videos"
              className="rounded-sm text-[14px] text-lake underline underline-offset-4"
            >
              All my videos →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <InsightCard value={done} label="Observations complete" accent="forest" />
            <InsightCard value={inProgress} label="In progress" accent="lake" />
            <InsightCard value={notStarted} label="Not started" />
            <InsightCard value={cardsToFill} label="Context cards to fill" />
          </div>

          {nextUp.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full border-collapse text-left text-[14px]">
                <thead>
                  <tr className="bg-sunken text-[12px] text-graphite">
                    <th className="px-4 py-2 font-semibold">Next up</th>
                    <th className="px-4 py-2 font-semibold">Context card</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {nextUp.map((row) => (
                    <tr
                      key={row.videoId}
                      className="h-10 border-t border-hairline transition-colors duration-[90ms] hover:bg-card"
                    >
                      <td className="px-4">
                        <Link
                          href={`/videos/${row.videoId}`}
                          className="video-code rounded-sm text-[14px] text-lake underline-offset-4 hover:underline"
                        >
                          {row.displayCode}
                        </Link>
                      </td>
                      <td className="px-4 text-graphite">
                        {row.fillsContextCard ? "Yours to fill" : "—"}
                      </td>
                      <td className="px-4">
                        <StatusPill status={row.observationStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Admin overview */}
        {adminStats && (
          <section aria-label="Study overview" className="space-y-4">
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
                Full dashboards, assignment and exports arrive in stages 3–4
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <InsightCard value={adminStats.codableVideos} label="Codable videos" />
              <InsightCard value={adminStats.assignedVideos} label="Currently assigned" accent="lake" />
              <InsightCard
                value={adminStats.submittedObservations}
                label="Individual observations submitted"
                accent="forest"
              />
              <InsightCard value={adminStats.activeCoders} label="Active accounts" />
            </div>
          </section>
        )}

        <footer className="border-t border-hairline pt-4">
          <Link
            href="/styleguide"
            className="rounded-sm text-[13px] text-smoke underline underline-offset-4 hover:text-lake"
          >
            Style guide
          </Link>
        </footer>
      </div>
    </main>
  );
}
