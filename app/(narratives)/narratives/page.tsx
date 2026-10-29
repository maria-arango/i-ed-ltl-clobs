/**
 * /narratives — the enumerator's assigned narratives, in the order to do
 * them, with status (Amendment §51). Restricted query layer only. Same
 * table, pills and empty state as My videos.
 */
import Link from "next/link";
import { requireNarrativesAccess } from "@/lib/auth-helpers";
import { listMyNarratives } from "@/lib/db/narratives";
import { NxPageTitle, NxStatus } from "@/components/narratives/nx-ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default async function MyNarratives() {
  const { session } = await requireNarrativesAccess();
  const rows = await listMyNarratives(session.user.id);
  const next = rows.find((r) => r.status !== "submitted");
  const done = rows.filter((r) => r.status === "submitted").length;
  return (
    <div className="space-y-6">
      <NxPageTitle sub={rows.length ? `${done} of ${rows.length} submitted. Work through them in order.` : undefined}>
        My narratives
      </NxPageTitle>
      {rows.length === 0 ? (
        <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
          <p className="text-[15px] text-graphite">
            No narratives assigned yet. Your list fills when a coordinator assigns them. Check back, or ask your
            coordinator.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow header>
              <TableHead className="w-20">Order</TableHead>
              <TableHead>Narrative</TableHead>
              <TableHead className="hidden sm:table-cell">Length</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Last saved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.assignmentId}>
                <TableCell className="mono text-graphite">{r.orderNo}</TableCell>
                <TableCell>
                  <Link
                    href={`/narratives/${r.assignmentId}`}
                    className="rounded-sm font-medium text-lake underline underline-offset-4"
                  >
                    {r.label}
                  </Link>
                  {next?.assignmentId === r.assignmentId && (
                    <span className="ml-2 text-[12px] font-medium text-smoke">Next</span>
                  )}
                </TableCell>
                <TableCell className="mono hidden text-graphite sm:table-cell">{r.durationLabel}</TableCell>
                <TableCell>
                  <NxStatus status={r.status} />
                </TableCell>
                <TableCell className="hidden text-[13px] text-smoke md:table-cell">
                  {r.status === "submitted" ? fmt(r.submittedAt) : r.status === "in_progress" ? fmt(r.updatedAt) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
