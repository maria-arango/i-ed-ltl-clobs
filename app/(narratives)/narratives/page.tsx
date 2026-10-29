/**
 * /narratives — the enumerator's assigned narratives, in the order to do
 * them, with status (Amendment §51). Restricted query layer only.
 */
import Link from "next/link";
import { requireNarrativesAccess } from "@/lib/auth-helpers";
import { listMyNarratives } from "@/lib/db/narratives";
import { NxPageTitle, NxStatus } from "@/components/narratives/nx-ui";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default async function MyNarratives() {
  const { session } = await requireNarrativesAccess();
  const rows = await listMyNarratives(session.user.id);
  const next = rows.find((r) => r.status !== "submitted");
  const done = rows.filter((r) => r.status === "submitted").length;
  return (
    <main className="mx-auto max-w-[960px] px-4 py-8 sm:px-6">
      <NxPageTitle
        sub={
          rows.length === 0
            ? "Nothing is assigned to you yet."
            : `${done} of ${rows.length} submitted. Work through them in order.`
        }
      >
        Your narratives
      </NxPageTitle>
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-md border border-nx-border bg-nx-surface">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead className="bg-nx-sunken text-[13px] text-nx-muted">
              <tr>
                <th scope="col" className="w-16 px-4 py-2.5 font-medium">Order</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Narrative</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Length</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Last saved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.assignmentId} className="border-t border-nx-border">
                  <td className="px-4 py-3 tabular-nums text-nx-muted">{r.orderNo}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/narratives/${r.assignmentId}`}
                      className="font-medium text-nx-accent underline-offset-2 hover:underline"
                    >
                      {r.label}
                    </Link>
                    {next?.assignmentId === r.assignmentId && (
                      <span className="ml-2 text-[12px] font-medium text-nx-muted">Next</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 tabular-nums text-nx-muted sm:table-cell">{r.durationLabel}</td>
                  <td className="px-4 py-3">
                    <NxStatus status={r.status} />
                  </td>
                  <td className="hidden px-4 py-3 text-nx-muted md:table-cell">
                    {r.status === "submitted" ? fmt(r.submittedAt) : r.status === "in_progress" ? fmt(r.updatedAt) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
