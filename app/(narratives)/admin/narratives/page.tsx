/**
 * /admin/narratives — the Narratives dashboard (Amendment §51): progress by
 * enumerator and by narrative, loading and assigning, and Word downloads.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getNarrativeDashboard, listReviewers, type DashboardRow } from "@/lib/db/admin-narratives";
import { NxCard, NxPageTitle, NxStatus } from "@/components/narratives/nx-ui";
import { AssignInline, ImportPanel, SheetPanel } from "@/components/narratives/admin/panels";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const hm = (min: number) => (min ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}` : "");

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-nx-border bg-nx-surface px-4 py-3">
      <div className="text-[13px] text-nx-muted">{label}</div>
      <div className="mt-0.5 text-[24px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function NarrativesDashboard() {
  await requireAdmin();
  const [rows, reviewers] = await Promise.all([getNarrativeDashboard(), listReviewers()]);
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
    <main className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <NxPageTitle sub="Progress of the narrative review, assignments, and Word downloads.">Narratives</NxPageTitle>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/narratives/bundle?which=submitted" className="rounded-md bg-nx-accent px-3.5 py-2 text-[14px] font-medium text-white hover:bg-nx-accent-hover">
            Download submitted (.zip)
          </a>
          <a href="/api/admin/narratives/bundle?which=all" className="rounded-md border border-nx-border-strong bg-nx-surface px-3.5 py-2 text-[14px] font-medium hover:bg-nx-sunken">
            Download all assigned (.zip)
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Counter label="Loaded" value={rows.length} />
        <Counter label="Not assigned" value={count("unassigned")} />
        <Counter label="Not started" value={count("not_started")} />
        <Counter label="In progress" value={count("in_progress")} />
        <Counter label="Submitted" value={count("submitted")} />
      </div>

      <section aria-labelledby="by-person">
        <h2 id="by-person" className="mb-3 text-[18px] font-semibold">By enumerator</h2>
        {people.size === 0 ? (
          <p className="text-[14px] text-nx-muted">No narratives are assigned yet.</p>
        ) : (
          <NxCard className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-nx-sunken text-[13px] text-nx-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Enumerator</th>
                  <th className="px-4 py-2.5 font-medium">Assigned</th>
                  <th className="px-4 py-2.5 font-medium">Not started</th>
                  <th className="px-4 py-2.5 font-medium">In progress</th>
                  <th className="px-4 py-2.5 font-medium">Submitted</th>
                  <th className="px-4 py-2.5 font-medium">Time worked (h:mm)</th>
                  <th className="px-4 py-2.5 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {[...people.values()]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => {
                    const last = p.rows.map((r) => r.lastActivity).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
                    const n = (s: string) => p.rows.filter((r) => r.status === s).length;
                    return (
                      <tr key={p.name} className="border-t border-nx-border">
                        <td className="px-4 py-2.5 font-medium">{p.name}</td>
                        <td className="px-4 py-2.5 tabular-nums">{p.rows.length}</td>
                        <td className="px-4 py-2.5 tabular-nums">{n("not_started")}</td>
                        <td className="px-4 py-2.5 tabular-nums">{n("in_progress")}</td>
                        <td className="px-4 py-2.5 tabular-nums">{n("submitted")}</td>
                        <td className="px-4 py-2.5 tabular-nums">{hm(p.rows.reduce((s, r) => s + r.activeMinutes, 0))}</td>
                        <td className="px-4 py-2.5 text-nx-muted">{fmt(last)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </NxCard>
        )}
      </section>

      <section aria-labelledby="by-narrative">
        <h2 id="by-narrative" className="mb-3 text-[18px] font-semibold">By narrative</h2>
        {rows.length === 0 ? (
          <p className="text-[14px] text-nx-muted">No narratives loaded yet. Use Load narratives below.</p>
        ) : (
          <NxCard className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-nx-sunken text-[13px] text-nx-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Narrative</th>
                  <th className="px-4 py-2.5 font-medium">Reviewer</th>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Last activity</th>
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium" title="Characters added in red / characters struck / comments">Edits</th>
                  <th className="px-4 py-2.5 font-medium" title="Words of the original AI text deleted instead of struck">Original deleted</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.narrativeId} className="border-t border-nx-border align-top">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.displayCode}</div>
                      <div className="text-[13px] text-nx-muted">
                        {r.lessonId ?? (r.label !== r.displayCode ? r.label : "lesson ID removed")} · {r.durationLabel} · {r.episodes} episodes
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{r.assigneeName ?? ""}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.orderNo ?? ""}</td>
                    <td className="px-4 py-2.5">
                      {r.status === "unassigned" ? <span className="text-[13px] text-nx-muted">Not assigned</span> : <NxStatus status={r.status} />}
                    </td>
                    <td className="px-4 py-2.5 text-nx-muted">{fmt(r.lastActivity)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{hm(r.activeMinutes)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[13px]">
                      {r.stats ? `${r.stats.redChars} / ${r.stats.struckChars} / ${r.stats.comments}` : ""}
                    </td>
                    <td className={`px-4 py-2.5 tabular-nums ${r.stats?.originalWordsRemoved ? "font-semibold text-nx-warn" : ""}`}>
                      {r.stats ? r.stats.originalWordsRemoved : ""}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.assignmentId ? (
                        <div className="flex flex-wrap gap-3 text-[13px] font-medium">
                          <Link href={`/admin/narratives/${r.assignmentId}`} className="text-nx-accent hover:underline">
                            Open
                          </Link>
                          <a href={`/api/admin/narratives/${r.assignmentId}/docx`} className="text-nx-accent hover:underline">
                            Word
                          </a>
                        </div>
                      ) : (
                        <AssignInline narrativeId={r.narrativeId} reviewers={reviewers} nextOrder={1} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </NxCard>
        )}
        {reviewers.length === 0 && (
          <p className="mt-2 text-[14px] text-nx-warn">
            Nobody is on the Narratives team yet. Add people on the <Link href="/admin/team" className="underline">Team</Link> screen and tick Narratives.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <NxCard className="p-5">
          <h2 className="mb-3 text-[18px] font-semibold">Load narratives</h2>
          <ImportPanel />
        </NxCard>
        <NxCard className="p-5">
          <h2 className="mb-3 text-[18px] font-semibold">Assign from a sheet</h2>
          <SheetPanel />
        </NxCard>
      </div>
    </main>
  );
}
