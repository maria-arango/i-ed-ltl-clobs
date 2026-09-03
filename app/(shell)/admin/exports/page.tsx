/**
 * Exports (admin-only, Stage 4): generate the tidy dataset set and
 * re-download any past export unchanged. Everything here is unblinded by
 * design (addendum §12, §13) and every download is audited.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listExports } from "@/lib/db/admin-exports";
import { EXPORT_TABLES } from "@/lib/export/contract";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportRunner } from "./export-runner";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

export default async function ExportsPage() {
  await requireAdmin();
  const exportsList = await listExports();

  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-8">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">Exports</span>
      </nav>

      <section className="space-y-1">
        <h1
          className="font-serif text-ink"
          style={{
            fontSize: "var(--clobs-text-display)",
            lineHeight: "var(--clobs-leading-display)",
            letterSpacing: "var(--clobs-tracking-display)",
          }}
        >
          Exports
        </h1>
        <p className="text-[15px] text-graphite">
          The tidy datasets for analysis and AI training: scores long and
          wide, the single-table context cards, notes, calibration records,
          the assignment history, the event log, and the crosswalk. Each
          export carries its timestamp, row counts, rubric version and
          codebook. These files unblind school, arm and teacher: keep them
          inside the research team.
        </p>
      </section>

      <ExportRunner tableCount={EXPORT_TABLES.length} />

      <section aria-label="Tables in every export" className="space-y-3">
        <h2
          className="font-sans font-medium text-ink"
          style={{
            fontSize: "var(--clobs-text-heading-sm)",
            lineHeight: "var(--clobs-leading-heading-sm)",
            letterSpacing: "var(--clobs-tracking-heading-sm)",
          }}
        >
          What is in an export
        </h2>
        <Table>
          <TableHeader>
            <TableRow header>
              <TableHead>Table</TableHead>
              <TableHead>One row is</TableHead>
              <TableHead className="text-right">Columns</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {EXPORT_TABLES.map((t) => (
              <TableRow key={t.name}>
                <TableCell className="mono text-[13px] text-ink">{t.name}</TableCell>
                <TableCell className="text-graphite">{t.unit}</TableCell>
                <TableCell className="mono text-right text-graphite">{t.columns.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[13px] text-smoke">
          Plus codebook.json, codebook.md and manifest.json (file sizes and
          SHA-256 checksums). The contract is defined once in
          lib/export/contract.ts and tested.
        </p>
      </section>

      <section aria-label="Past exports" className="space-y-3">
        <h2
          className="font-sans font-medium text-ink"
          style={{
            fontSize: "var(--clobs-text-heading-sm)",
            lineHeight: "var(--clobs-leading-heading-sm)",
            letterSpacing: "var(--clobs-tracking-heading-sm)",
          }}
        >
          Past exports
        </h2>
        {exportsList.length === 0 ? (
          <p className="text-[14px] text-graphite">
            No exports yet. The first one appears here the moment it is
            generated.
          </p>
        ) : (
          <ul className="space-y-4">
            {exportsList.map((e) => {
              const totalRows = Object.values(e.rowCounts).reduce((s, n) => s + n, 0);
              return (
                <li
                  key={e.id}
                  className="elev-card space-y-4 rounded-2xl border border-hairline bg-card p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    <div>
                      <p className="text-[15px] text-ink">{formatWhen(e.requestedAt)}</p>
                      <p className="text-[13px] text-graphite">
                        by {e.requestedBy} · rubric {e.rubricVersion ?? "(none)"} ·{" "}
                        <span className="mono">{totalRows.toLocaleString("en-GB")}</span> rows ·{" "}
                        {formatBytes(e.totalBytes)} ·{" "}
                        <span className="mono text-smoke">{e.id.slice(0, 8)}</span>
                      </p>
                    </div>
                    <a
                      href={`/api/admin/exports/${e.id}/bundle.zip`}
                      className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
                    >
                      Download everything (.zip)
                    </a>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-hairline">
                          <th className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke">
                            Table
                          </th>
                          <th className="py-2 pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke">
                            Rows
                          </th>
                          <th className="py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke">
                            Files
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {EXPORT_TABLES.map((t) => (
                          <tr key={t.name} className="border-t border-hairline first:border-t-0">
                            <td className="mono py-2 pr-4 text-ink">{t.name}</td>
                            <td className="mono py-2 pr-4 text-right text-graphite">
                              {(e.rowCounts[t.name] ?? 0).toLocaleString("en-GB")}
                            </td>
                            <td className="py-2">
                              <span className="flex flex-wrap gap-x-4 gap-y-1">
                                {["csv", "dta"].map((ext) => {
                                  const name = `${t.name}.${ext}`;
                                  const f = e.files.find((x) => x.filename === name);
                                  return (
                                    <a
                                      key={name}
                                      href={`/api/admin/exports/${e.id}/${name}`}
                                      className="rounded-sm text-lake underline underline-offset-4"
                                    >
                                      .{ext}
                                      {f && <span className="ml-1 text-smoke no-underline">({formatBytes(f.byteSize)})</span>}
                                    </a>
                                  );
                                })}
                              </span>
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-hairline">
                          <td className="py-2 pr-4 text-graphite">documentation</td>
                          <td className="py-2 pr-4" />
                          <td className="py-2">
                            <span className="flex flex-wrap gap-x-4 gap-y-1">
                              {["codebook.md", "codebook.json", "manifest.json"].map((name) => (
                                <a
                                  key={name}
                                  href={`/api/admin/exports/${e.id}/${name}`}
                                  className="rounded-sm text-lake underline underline-offset-4"
                                >
                                  {name}
                                </a>
                              ))}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
