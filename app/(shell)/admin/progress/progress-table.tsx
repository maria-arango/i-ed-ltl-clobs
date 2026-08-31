"use client";
/**
 * The study's video-by-video progress as a filterable table (beautifului
 * filter-table pattern): stage chips with live counts, search by code or
 * pair. Long lists cap at 200 visible rows — narrow with a chip or the
 * search box.
 */
import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProgressRow, ProgressStage } from "@/lib/db/admin-progress";

const STAGES: Array<{ key: "all" | ProgressStage; label: string; dot?: string }> = [
  { key: "all", label: "All" },
  { key: "pool", label: "In the pool", dot: "var(--clobs-ash)" },
  { key: "assigned", label: "Assigned", dot: "var(--clobs-lake)" },
  { key: "one_submitted", label: "One submitted", dot: "var(--clobs-score-2-edge)" },
  { key: "ready_to_calibrate", label: "Ready to calibrate", dot: "var(--clobs-score-3-edge)" },
  { key: "calibrated", label: "Calibrated", dot: "var(--clobs-forest)" },
];

const STAGE_LABEL: Record<ProgressStage, string> = {
  pool: "In the pool",
  assigned: "Assigned",
  one_submitted: "One submitted",
  ready_to_calibrate: "Ready to calibrate",
  calibrated: "Calibrated",
};

const MAX_VISIBLE = 200;

export function ProgressTable({ rows }: { rows: ProgressRow[] }) {
  const [filter, setFilter] = useState<"all" | ProgressStage>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const s of STAGES) if (s.key !== "all") c[s.key] = 0;
    for (const r of rows) c[r.stage]++;
    return c;
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.stage !== filter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        r.displayCode.toLowerCase().includes(q) ||
        (r.pairLabel ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });
  const visible = filtered.slice(0, MAX_VISIBLE);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by stage" className="flex flex-wrap gap-1.5">
          {STAGES.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors duration-[90ms] ${
                  active
                    ? "border-hairline-strong bg-paper text-ink"
                    : "border-hairline bg-card text-graphite hover:text-ink"
                }`}
              >
                {f.dot && (
                  <span aria-hidden className="size-1.5 rounded-full" style={{ background: f.dot }} />
                )}
                {f.label}
                <span className="mono text-[11px] text-smoke">{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code or pair…"
          aria-label="Search videos"
          className="w-56 rounded-md border border-hairline bg-paper px-3 py-1.5 text-[13px] text-ink focus:border-hairline-strong"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow header>
            <TableHead>Video</TableHead>
            <TableHead>Pair</TableHead>
            <TableHead>Wave</TableHead>
            <TableHead>Scores in</TableHead>
            <TableHead>Stage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow key={r.videoId}>
              <TableCell>
                <span className="video-code text-[14px] text-ink">{r.displayCode}</span>
              </TableCell>
              <TableCell className="text-graphite">{r.pairLabel ?? "—"}</TableCell>
              <TableCell className="num text-graphite">{r.waveNo ?? "—"}</TableCell>
              <TableCell className="num text-graphite">{r.submittedCount} of 2</TableCell>
              <TableCell
                className={
                  r.stage === "calibrated"
                    ? "text-ink"
                    : r.stage === "pool"
                      ? "text-smoke"
                      : "text-graphite"
                }
              >
                {STAGE_LABEL[r.stage]}
              </TableCell>
            </TableRow>
          ))}
          {visible.length === 0 && (
            <TableRow>
              <TableCell className="text-graphite" colSpan={5}>
                Nothing matches this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {filtered.length > MAX_VISIBLE && (
        <p className="text-[12px] text-smoke">
          Showing the first {MAX_VISIBLE} of {filtered.length} — narrow with a
          chip or the search box.
        </p>
      )}
    </div>
  );
}
