/**
 * My videos — the coder's queue, filterable by status, searchable by code
 * or partner. Server component; reads exclusively through the restricted
 * coder query layer.
 */
import Link from "next/link";
import { requireSession } from "@/lib/auth-helpers";
import { getCoderQueue, getMyCodingStats, getRubricContent } from "@/lib/db/coder";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ViewSwitch } from "@/components/ui/view-switch";
import { MyDashboard } from "@/components/videos/my-dashboard";
import { VideosTable } from "@/components/videos/videos-table";

export default async function MyVideos() {
  const session = await requireSession();
  const [queue, stats, rubric] = await Promise.all([
    getCoderQueue(session.user.id),
    getMyCodingStats(session.user.id),
    getRubricContent(),
  ]);
  const done = queue.filter((q) => q.observationStatus === "submitted").length;
  const conceptNames: Record<number, string> = {};
  for (const c of rubric?.concepts ?? []) conceptNames[c.itemNo] = c.name;

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link
          href="/"
          className="rounded-sm text-lake underline underline-offset-4"
        >
          Home
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">My videos</span>
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
          My videos
        </h1>
        <p className="text-[14px] text-smoke">
          <NumberTicker value={done} /> of{" "}
          <span className="mono">{queue.length}</span> complete
        </p>
      </header>

      <ViewSwitch
        ariaLabel="My videos views"
        views={[
          {
            key: "videos",
            label: "My videos",
            content:
              queue.length === 0 ? (
                <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
                  <p className="text-[15px] text-graphite">
                    No videos assigned yet. Your queue fills when an admin runs
                    an assignment wave. Check back, or ask your admin.
                  </p>
                </div>
              ) : (
                <VideosTable
                  rows={queue.map((q) => ({
                    videoId: q.videoId,
                    displayCode: q.displayCode,
                    durationSeconds: q.durationSeconds,
                    partnerName: q.partnerName,
                    fillsContextCard: q.fillsContextCard,
                    observationStatus: q.observationStatus,
                  }))}
                />
              ),
          },
          {
            key: "dashboard",
            label: "My dashboard",
            content: (
              <MyDashboard
                stats={JSON.parse(JSON.stringify(stats))}
                conceptNames={conceptNames}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
