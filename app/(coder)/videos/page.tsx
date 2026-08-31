/**
 * My videos — the coder's queue. Server component; reads exclusively
 * through the restricted coder query layer.
 */
import Link from "next/link";
import { requireSession } from "@/lib/auth-helpers";
import { getCoderQueue } from "@/lib/db/coder";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/ui/status-pill";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function MyVideos() {
  const session = await requireSession();
  const queue = await getCoderQueue(session.user.id);
  const done = queue.filter((q) => q.observationStatus === "submitted").length;

  return (
    <AppShell
      email={session.user.email}
      role={session.user.role}
      isChiefCoder={session.user.isChiefCoder}
    >
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
          <span className="mono">{done}</span> of{" "}
          <span className="mono">{queue.length}</span> complete
        </p>
      </header>

      {queue.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-card p-6">
          <p className="text-[15px] text-graphite">
            No videos assigned yet. Your queue fills when an admin runs an
            assignment wave — check back, or ask your admin.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="bg-sunken text-[12px] text-graphite">
                <th className="px-4 py-2 font-semibold">Video</th>
                <th className="px-4 py-2 font-semibold">Duration</th>
                <th className="px-4 py-2 font-semibold">Context card</th>
                <th className="px-4 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
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
                  <td className="num px-4 text-smoke">
                    {formatDuration(row.durationSeconds)}
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
      </div>
    </AppShell>
  );
}
