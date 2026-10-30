/**
 * /admin/narratives — the Narratives dashboard (Amendment §51): progress by
 * enumerator and by narrative, loading and assigning, Word downloads and
 * the copy to the Harvard Drive. Built from the platform's own components.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getNarrativeDashboard, listReviewers, nextOrders, type DashboardRow } from "@/lib/db/admin-narratives";
import { NxCard, NxPageTitle, NxSectionTitle, NxStatus, nxButtonClass } from "@/components/narratives/nx-ui";
import { AssignInline, BackupNowButton, ImportPanel, SheetPanel, VideoCheckBadge } from "@/components/narratives/admin/panels";
import type { Reviewer } from "@/lib/db/admin-narratives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const hm = (min: number) => (min ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}` : "");

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <NxCard className="px-5 py-4">
      <div className="text-[13px] text-smoke">{label}</div>
      <div className="mono mt-1 text-[26px] font-medium text-ink">{value}</div>
    </NxCard>
  );
}

/**
 * One row per narrative. Admins see the lesson (tr_id), school (sid) and
 * video file; the enumerator sees "Video <order>" (Amendment §61).
 */
function NarrativeTable({
  rows,
  reviewers,
  nextOrders,
  practice = false,
}: {
  rows: DashboardRow[];
  reviewers: Reviewer[];
  nextOrders: Record<string, number>;
  practice?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow header>
          <TableHead>Lesson (tr_id)</TableHead>
          <TableHead>Reviewer</TableHead>
          <TableHead>Shows as</TableHead>
          <TableHead>Video</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last activity</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>
            <span title="Characters added in red / characters struck / comments">Edits</span>
          </TableHead>
          <TableHead>
            <span title="Words of the original AI text deleted instead of struck">Original deleted</span>
          </TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.narrativeId} className="align-top">
            <TableCell>
              <div className="mono text-ink">{r.lessonId ?? r.displayCode}</div>
              <div className="text-[13px] text-smoke">
                {r.sid ? `School ${r.sid} · ` : ""}
                {r.durationLabel ? `${r.durationLabel} · ` : ""}
                {r.episodes} {r.format === "script" ? "lines" : "episodes"}
              </div>
            </TableCell>
            <TableCell className="text-ink">{r.assigneeName ?? ""}</TableCell>
            <TableCell className="text-[14px]">{r.orderNo === null ? "" : practice ? "Practice" : `Video ${r.orderNo}`}</TableCell>
            <TableCell className="max-w-[260px] break-all text-[13px]">
              {r.assignmentId ? (
                r.videoUrl ? (
                  <VideoCheckBadge check={r.videoCheck} file={r.videoFile} />
                ) : (
                  <span className="text-clay">No link</span>
                )
              ) : null}
            </TableCell>
            <TableCell>
              {r.status === "unassigned" ? (
                <span className="text-[13px] text-smoke">Not assigned</span>
              ) : (
                <NxStatus status={r.status} />
              )}
            </TableCell>
            <TableCell className="text-[13px] text-smoke">{fmt(r.lastActivity)}</TableCell>
            <TableCell className="mono">{hm(r.activeMinutes)}</TableCell>
            <TableCell className="mono text-[13px]">
              {r.stats ? `${r.stats.redChars} / ${r.stats.struckChars} / ${r.stats.comments}` : ""}
            </TableCell>
            <TableCell className={`mono ${r.stats?.originalWordsRemoved ? "font-semibold text-clay" : ""}`}>
              {r.stats ? r.stats.originalWordsRemoved : ""}
            </TableCell>
            <TableCell className="text-right">
              {r.assignmentId ? (
                <span className="inline-flex gap-1.5">
                  <Link href={`/admin/narratives/${r.assignmentId}`} className={nxButtonClass("pill")}>
                    Open
                  </Link>
                  <a href={`/api/admin/narratives/${r.assignmentId}/docx`} className={nxButtonClass("pill")}>
                    Word
                  </a>
                </span>
              ) : (
                <AssignInline narrativeId={r.narrativeId} reviewers={reviewers} nextOrders={nextOrders} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function NarrativesDashboard() {
  await requireAdmin();
  const [rows, practiceRows, reviewers, orders] = await Promise.all([
    getNarrativeDashboard(),
    getNarrativeDashboard("training"),
    listReviewers(),
    nextOrders(),
  ]);
  const count = (s: DashboardRow["status"]) => rows.filter((r) => r.status === s).length;

  const people = new Map<string, { name: string; rows: DashboardRow[] }>();
  for (const r of rows) {
    if (!r.assigneeId) continue;
    const p = people.get(r.assigneeId) ?? { name: r.assigneeName ?? "", rows: [] };
    p.rows.push(r);
    people.set(r.assigneeId, p);
  }
  const sorted = [...rows].sort(
    (a, b) => (a.assigneeName ?? "~").localeCompare(b.assigneeName ?? "~") || (a.orderNo ?? 0) - (b.orderNo ?? 0),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <NxPageTitle sub="Progress of the narrative review, assignments and Word downloads. A full copy goes to the Harvard Drive every night.">
          Narratives
        </NxPageTitle>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/narratives/bundle?which=submitted" className={nxButtonClass("primary")}>
            Download submitted (.zip)
          </a>
          <a href="/api/admin/narratives/bundle?which=submitted&since=24h" className={nxButtonClass("secondary")}>
            Submitted in the last 24 hours (.zip)
          </a>
          <a href="/api/admin/narratives/bundle?which=all" className={nxButtonClass("secondary")}>
            All assigned (.zip)
          </a>
        </div>
      </div>
      <div className="-mt-4 flex justify-end">
        <BackupNowButton />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Counter label="Loaded" value={rows.length} />
        <Counter label="Not assigned" value={count("unassigned")} />
        <Counter label="Not started" value={count("not_started")} />
        <Counter label="In progress" value={count("in_progress")} />
        <Counter label="Submitted" value={count("submitted")} />
      </div>

      <section aria-labelledby="by-person">
        <NxSectionTitle id="by-person">By enumerator</NxSectionTitle>
        {people.size === 0 ? (
          <p className="text-[15px] text-graphite">No narratives are assigned yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Enumerator</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Not started</TableHead>
                <TableHead>In progress</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Time worked (h:mm)</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...people.values()]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => {
                  const last =
                    p.rows
                      .map((r) => r.lastActivity)
                      .filter((d): d is Date => !!d)
                      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
                  const n = (s: string) => p.rows.filter((r) => r.status === s).length;
                  return (
                    <TableRow key={p.name}>
                      <TableCell className="text-ink">{p.name}</TableCell>
                      <TableCell className="mono">{p.rows.length}</TableCell>
                      <TableCell className="mono">{n("not_started")}</TableCell>
                      <TableCell className="mono">{n("in_progress")}</TableCell>
                      <TableCell className="mono">{n("submitted")}</TableCell>
                      <TableCell className="mono">{hm(p.rows.reduce((s, r) => s + r.activeMinutes, 0))}</TableCell>
                      <TableCell className="text-[13px] text-smoke">{fmt(last)}</TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="by-narrative">
        <NxSectionTitle id="by-narrative">By narrative</NxSectionTitle>
        {rows.length === 0 ? (
          <p className="text-[15px] text-graphite">No narratives loaded yet. Use Load narratives below.</p>
        ) : (
          <NarrativeTable rows={sorted} reviewers={reviewers} nextOrders={orders.live} />
        )}
        {reviewers.length === 0 && (
          <p className="mt-2 text-[14px] text-clay">
            Nobody is on the Narratives team yet. Add people on the{" "}
            <Link href="/admin/team" className="rounded-sm text-lake underline underline-offset-4">
              Team
            </Link>{" "}
            screen and tick Narratives.
          </p>
        )}
      </section>

      <section aria-labelledby="practice">
        <NxSectionTitle id="practice">Practice narratives</NxSectionTitle>
        <p className="mb-3 text-[14px] text-graphite">
          For trying the platform as an enumerator. Assign one to anyone (yourself included: tick Narratives on your
          row on the Team screen). Not counted above, not in the downloads, not in the nightly copy.
        </p>
        {practiceRows.length === 0 ? (
          <p className="text-[15px] text-graphite">None loaded. Tick Practice under Load narratives.</p>
        ) : (
          <NarrativeTable rows={practiceRows} reviewers={reviewers} nextOrders={orders.training} practice />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <NxCard className="p-6">
          <NxSectionTitle>Load narratives</NxSectionTitle>
          <ImportPanel />
        </NxCard>
        <NxCard className="p-6">
          <NxSectionTitle>Assign from a sheet</NxSectionTitle>
          <SheetPanel />
        </NxCard>
      </div>
    </div>
  );
}
