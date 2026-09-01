"use client";
/**
 * The Progress dashboard's living half: what's ahead (expected vs actual
 * per study week, from the availability plans), the pipeline, the arm mix,
 * and the filterable per-video table (school / arm / teacher / stage /
 * search). Chart colors are validated per the dataviz method: the pipeline
 * is ORDINAL → one-hue sequential ramp; arms are a 3-hue categorical trio;
 * expected-vs-actual pairs hollow tan with solid lake (shape + color).
 */
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import GlideMenu from "@/components/primitives/GlideMenu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProgressRow, ProgressStage, WeekOutlook } from "@/lib/db/admin-progress";

/* Pipeline (ordinal) — sequential lake ramp, light → dark. */
const STAGE_RAMP: Record<ProgressStage, string> = {
  pool: "#D9E4F0",
  assigned: "#A9C1DC",
  one_submitted: "#7C9CBF",
  ready_to_calibrate: "#4F7AA6",
  calibrated: "#2C5C8F",
};
const STAGE_LABEL: Record<ProgressStage, string> = {
  pool: "In the pool",
  assigned: "Assigned, no scores yet",
  one_submitted: "1 of 2 scores in",
  ready_to_calibrate: "Ready to calibrate",
  calibrated: "Calibrated",
};
const STAGES: ProgressStage[] = [
  "pool",
  "assigned",
  "one_submitted",
  "ready_to_calibrate",
  "calibrated",
];

/* Arms — validated categorical trio, fixed order. */
const ARM_COLOR: Record<string, string> = {
  control: "#2F6BAA",
  dispersed: "#B4642B",
  connected: "#7B4B94",
};

const TOOLTIP_STYLE = {
  background: "var(--clobs-paper)",
  border: "1px solid var(--clobs-hairline-strong)",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--clobs-ink)",
};

const MAX_VISIBLE = 200;

export function ProgressDashboard({
  rows,
  weeks,
}: {
  rows: ProgressRow[];
  weeks: WeekOutlook[];
}) {
  const [stageFilter, setStageFilter] = useState<"all" | ProgressStage>("all");
  const [school, setSchool] = useState("all");
  const [arm, setArm] = useState("all");
  const [teacher, setTeacher] = useState("all");
  const [query, setQuery] = useState("");

  const schools = useMemo(
    () => [...new Set(rows.map((r) => r.sid))].sort(),
    [rows],
  );
  const teachers = useMemo(
    () =>
      [...new Set(rows.map((r) => r.teacher).filter((t): t is string => !!t))].sort(),
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (stageFilter !== "all" && r.stage !== stageFilter) return false;
    if (school !== "all" && r.sid !== school) return false;
    if (arm !== "all" && r.arm !== arm) return false;
    if (teacher !== "all" && r.teacher !== teacher) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        r.displayCode.toLowerCase().includes(q) ||
        (r.pairLabel ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const st of STAGES) c[st] = 0;
    for (const r of rows) c[r.stage]++;
    return c;
  }, [rows]);

  // Charts reflect the CURRENT filter (minus the stage chip, so the
  // pipeline bar always shows the whole distribution of the slice).
  const chartSlice = rows.filter((r) => {
    if (school !== "all" && r.sid !== school) return false;
    if (arm !== "all" && r.arm !== arm) return false;
    if (teacher !== "all" && r.teacher !== teacher) return false;
    return true;
  });
  const pipelineDatum = useMemo(() => {
    const d: Record<string, number | string> = { name: "Videos" };
    for (const st of STAGES) d[st] = chartSlice.filter((r) => r.stage === st).length;
    return [d];
  }, [chartSlice]);
  const armData = useMemo(
    () =>
      ["control", "dispersed", "connected"]
        .map((a) => ({
          name: a,
          value: chartSlice.filter((r) => r.arm === a).length,
        }))
        .filter((d) => d.value > 0),
    [chartSlice],
  );
  const visible = filtered.slice(0, MAX_VISIBLE);

  const select =
    "rounded-md border border-hairline bg-paper px-2.5 py-1.5 text-[13px] text-ink focus:border-hairline-strong";

  return (
    <div className="space-y-8">
      {/* What's ahead */}
      <section aria-label="Weekly outlook" className="elev-card rounded-2xl border border-hairline bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-medium text-ink">
            The road to October 30
          </h2>
          <p className="text-[13px] text-graphite">
            Expected = the week&apos;s availability plan (videos/day × 5 days,
            two coders per video). Actual = calibrations signed.
          </p>
        </div>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} barGap={2}>
              <CartesianGrid stroke="var(--clobs-hairline)" vertical={false} />
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 12, fill: "var(--clobs-graphite)" }}
                axisLine={{ stroke: "var(--clobs-hairline-strong)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--clobs-graphite)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--clobs-sunken)" }} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar
                name="Expected (plan)"
                dataKey="expected"
                fill="rgba(169, 133, 63, 0.16)"
                stroke="#A9853F"
                strokeWidth={1.5}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                name="Actual (calibrated)"
                dataKey="actual"
                fill="#2C5C8F"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline */}
        <section aria-label="Pipeline" className="elev-card rounded-2xl border border-hairline bg-card p-6">
          <h2 className="text-[16px] font-medium text-ink">Where the videos stand</h2>
          <div className="mt-3 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineDatum} layout="vertical" barSize={34}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "transparent" }} />
                {STAGES.map((st) => (
                  <Bar
                    key={st}
                    name={STAGE_LABEL[st]}
                    dataKey={st}
                    stackId="pipeline"
                    fill={STAGE_RAMP[st]}
                    stroke="var(--clobs-paper)"
                    strokeWidth={2}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {STAGES.map((st) => (
              <li key={st} className="flex items-center gap-1.5 text-[12px] text-graphite">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: STAGE_RAMP[st] }} />
                {STAGE_LABEL[st]}{" "}
                <span className="mono text-smoke">
                  {chartSlice.filter((r) => r.stage === st).length}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Arm mix */}
        <section aria-label="Arm mix" className="elev-card rounded-2xl border border-hairline bg-card p-6">
          <h2 className="text-[16px] font-medium text-ink">Treatment-arm mix</h2>
          {armData.length === 0 ? (
            <p className="mt-3 text-[14px] text-graphite">
              No arm data in this slice.
            </p>
          ) : (
            <div className="mt-1 flex items-center gap-4">
              <div className="h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={armData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={38}
                      outerRadius={70}
                      paddingAngle={2}
                      stroke="var(--clobs-paper)"
                      strokeWidth={2}
                    >
                      {armData.map((d) => (
                        <Cell key={d.name} fill={ARM_COLOR[d.name]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5">
                {armData.map((d) => (
                  <li key={d.name} className="flex items-center gap-2 text-[13px] text-graphite">
                    <span aria-hidden className="size-2.5 rounded-sm" style={{ background: ARM_COLOR[d.name] }} />
                    <span className="capitalize text-ink">{d.name}</span>
                    <span className="mono text-smoke">{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <GlideMenu
            className="flex !flex-row flex-wrap gap-1.5"
            highlightClassName="rounded-full bg-sunken"
          >
            {(["all", ...STAGES] as const).map((key) => {
              const active = stageFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  data-menu-row
                  aria-pressed={active}
                  onClick={() => setStageFilter(key)}
                  className={`relative z-10 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors duration-[90ms] ${
                    active
                      ? "border-hairline-strong bg-paper text-ink"
                      : "border-hairline bg-card text-graphite hover:text-ink"
                  }`}
                >
                  {key !== "all" && (
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: STAGE_RAMP[key] }} />
                  )}
                  {key === "all" ? "All" : STAGE_LABEL[key]}
                  <span className="mono text-[11px] text-smoke">{counts[key]}</span>
                </button>
              );
            })}
          </GlideMenu>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[12px] font-medium text-graphite">
            School{" "}
            <select value={school} onChange={(e) => setSchool(e.target.value)} className={select}>
              <option value="all">All</option>
              {schools.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-medium text-graphite">
            Arm{" "}
            <select value={arm} onChange={(e) => setArm(e.target.value)} className={select}>
              <option value="all">All</option>
              <option value="control">control</option>
              <option value="dispersed">dispersed</option>
              <option value="connected">connected</option>
            </select>
          </label>
          <label className="text-[12px] font-medium text-graphite">
            Teacher{" "}
            <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className={select}>
              <option value="all">All</option>
              {teachers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code or pair…"
            aria-label="Search videos"
            className="ml-auto w-52 rounded-md border border-hairline bg-paper px-3 py-1.5 text-[13px] text-ink focus:border-hairline-strong"
          />
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow header>
            <TableHead>Video</TableHead>
            <TableHead>School</TableHead>
            <TableHead>Arm</TableHead>
            <TableHead>Teacher</TableHead>
            <TableHead>Pair</TableHead>
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
              <TableCell className="mono text-[12px] text-graphite">{r.sid}</TableCell>
              <TableCell className="text-[13px] capitalize text-graphite">{r.arm ?? "—"}</TableCell>
              <TableCell className="mono text-[12px] text-graphite">{r.teacher ?? "—"}</TableCell>
              <TableCell className="text-graphite">{r.pairLabel ?? "—"}</TableCell>
              <TableCell className="num text-graphite">{r.submittedCount} of 2</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 text-[13px] text-graphite">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: STAGE_RAMP[r.stage] }} />
                  {STAGE_LABEL[r.stage]}
                </span>
              </TableCell>
            </TableRow>
          ))}
          {visible.length === 0 && (
            <TableRow>
              <TableCell className="text-graphite" colSpan={7}>
                Nothing matches this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {filtered.length > MAX_VISIBLE && (
        <p className="text-[12px] text-smoke">
          Showing the first {MAX_VISIBLE} of {filtered.length}. Narrow with a
          filter or the search box.
        </p>
      )}
    </div>
  );
}
