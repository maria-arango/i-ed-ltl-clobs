/**
 * My videos — the coder's queue, with who they share each video with
 * (the partner they will calibrate with). Server component; reads
 * exclusively through the restricted coder query layer.
 */
import Link from "next/link";
import { requireSession } from "@/lib/auth-helpers";
import { getCoderQueue } from "@/lib/db/coder";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
        <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
          <p className="text-[15px] text-graphite">
            No videos assigned yet. Your queue fills when an admin runs an
            assignment wave. Check back, or ask your admin.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow header>
              <TableHead>Video</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Context card</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((row) => (
              <TableRow key={row.videoId}>
                <TableCell>
                  <Link
                    href={`/videos/${row.videoId}`}
                    className="video-code rounded-sm text-[14px] text-lake underline-offset-4 hover:underline"
                  >
                    {row.displayCode}
                  </Link>
                </TableCell>
                <TableCell className="num text-smoke">
                  {formatDuration(row.durationSeconds)}
                </TableCell>
                <TableCell className="text-graphite">
                  {row.partnerName ?? "—"}
                </TableCell>
                <TableCell className="text-graphite">
                  {row.fillsContextCard ? "Yours to fill" : "—"}
                </TableCell>
                <TableCell>
                  <StatusPill status={row.observationStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
