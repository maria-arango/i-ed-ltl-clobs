"use client";
/**
 * The coder's queue as a filterable table (beautifului filter-table
 * pattern, re-themed): status chips with live counts filter the rows, a
 * search box narrows by code or partner. Filtering is instant — this is an
 * Operate surface.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface VideoRow {
  videoId: string;
  displayCode: string;
  durationSeconds: number | null;
  partnerName: string | null;
  fillsContextCard: boolean;
  observationStatus: string | null;
}

type FilterKey = "all" | "new" | "in_progress" | "submitted";

const FILTERS: Array<{ key: FilterKey; label: string; dot?: string }> = [
  { key: "all", label: "All" },
  { key: "new", label: "New", dot: "var(--clobs-lake)" },
  { key: "in_progress", label: "In progress", dot: "var(--clobs-score-2-edge)" },
  { key: "submitted", label: "Submitted", dot: "var(--clobs-forest)" },
];

function statusKey(s: string | null): FilterKey {
  if (s === "submitted") return "submitted";
  if (s === "in_progress") return "in_progress";
  return "new";
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideosTable({ rows }: { rows: VideoRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: rows.length,
      new: 0,
      in_progress: 0,
      submitted: 0,
    };
    for (const r of rows) c[statusKey(r.observationStatus)]++;
    return c;
  }, [rows]);

  const visible = rows.filter((r) => {
    if (filter !== "all" && statusKey(r.observationStatus) !== filter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        r.displayCode.toLowerCase().includes(q) ||
        (r.partnerName ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
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
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: f.dot }}
                  />
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
          placeholder="Search code or partner…"
          aria-label="Search videos"
          className="w-56 rounded-md border border-hairline bg-paper px-3 py-1.5 text-[13px] text-ink focus:border-hairline-strong"
        />
      </div>

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
          {visible.map((row) => (
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
              <TableCell className="text-graphite">{row.partnerName ?? "—"}</TableCell>
              <TableCell className="text-graphite">
                {row.fillsContextCard ? "Yours to fill" : "—"}
              </TableCell>
              <TableCell>
                <StatusPill status={row.observationStatus} />
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
    </div>
  );
}
