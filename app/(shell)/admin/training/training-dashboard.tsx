"use client";
/**
 * The training dashboard, alive: the gold-comparison matrices and
 * reliability table, a charts-and-statistics view, and a SAMPLE PREVIEW
 * (10 synthetic enumerators over 2 synthetic videos) so admins can see
 * the dashboard's shape before real training data exists. Sample data is
 * generated deterministically in the browser and clearly bannered; it
 * never touches the database.
 */
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TrainingDashboard } from "@/lib/db/admin-training";

const THRESHOLD = 0.9;

const TOOLTIP_STYLE = {
  background: "var(--clobs-paper)",
  border: "1px solid var(--clobs-hairline-strong)",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--clobs-ink)",
};

/* ------------------------- sample data (client) ----------------------- */

const SAMPLE_NAMES = [
  "Amina N.",
  "Brenda K.",
  "Charles O.",
  "Doreen A.",
  "Emmanuel W.",
  "Florence N.",
  "Gerald M.",
  "Harriet T.",
  "Isaac B.",
  "Juliet S.",
];

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSample(): TrainingDashboard {
  const rand = mulberry(20261030);
  const goldByVideo = [
    { videoId: "sample-1", displayCode: "SAMPLE-01", gold: [1, 2, 3, 4, 2, 3, 1, 4] },
    { videoId: "sample-2", displayCode: "SAMPLE-02", gold: [2, 1, 4, 3, 1, 2, 3, 4] },
  ];
  const trainees = SAMPLE_NAMES.map((label, i) => ({ userId: `sample-t${i}`, label }));
  // Each trainee gets an accuracy level; misses drift by ±1 (occasionally 2).
  const accuracy = trainees.map((_, i) => 0.65 + (i / 9) * 0.33);
  const scoreFor = (gold: number, acc: number): number => {
    if (rand() < acc) return gold;
    const drift = rand() < 0.85 ? 1 : 2;
    const dir = rand() < 0.5 ? -1 : 1;
    return Math.min(4, Math.max(1, gold + dir * drift));
  };
  const videos = goldByVideo.map((v) => ({
    videoId: v.videoId,
    displayCode: v.displayCode,
    items: v.gold.map((gold, idx) => ({
      itemNo: idx + 1,
      gold,
      byTrainee: Object.fromEntries(
        trainees.map((t, ti) => [t.userId, scoreFor(gold, accuracy[ti])]),
      ) as Record<string, number | null>,
    })),
  }));
  const stats = trainees.map((t) => {
    let n = 0, exact = 0, adjacent = 0, weighted = 0, signed = 0, flips = 0;
    for (const v of videos) {
      for (const item of v.items) {
        const mine = item.byTrainee[t.userId];
        if (mine == null) continue;
        n++;
        const d = mine - item.gold;
        if (d === 0) exact++;
        if (Math.abs(d) <= 1) adjacent++;
        weighted += 1 - Math.pow(Math.abs(d) / 3, 2);
        signed += d;
        if ((mine <= 2) !== (item.gold <= 2)) flips++;
      }
    }
    return {
      userId: t.userId,
      label: t.label,
      itemsCompared: n,
      exact,
      adjacent,
      weighted: n ? weighted / n : 0,
      meanSigned: n ? signed / n : 0,
      columnFlips: flips,
    };
  });
  return { trainees, videos, stats };
}

/* ------------------------------ helpers ------------------------------- */

function pct(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function cellTone(gold: number, mine: number | null): React.CSSProperties {
  if (mine == null) return { color: "var(--clobs-smoke)" };
  const d = Math.abs(mine - gold);
  if (d === 0)
    return { background: "var(--clobs-forest-wash)", color: "var(--clobs-forest)" };
  if (d === 1) return { background: "var(--clobs-score-2)", color: "var(--clobs-ink)" };
  return { background: "#F3DDD1", color: "var(--clobs-clay)" };
}

/* ------------------------------ component ----------------------------- */

export function TrainingDashboardView({ real }: { real: TrainingDashboard }) {
  const [sampleOn, setSampleOn] = useState(false);
  const [chartsOn, setChartsOn] = useState(false);
  const sample = useMemo(() => makeSample(), []);
  const data = sampleOn ? sample : real;
  const empty = data.videos.length === 0 || data.trainees.length === 0;

  const exactRates = data.stats.map((s) => ({
    name: s.label,
    exact: s.itemsCompared ? Math.round((s.exact / s.itemsCompared) * 1000) / 10 : 0,
  }));
  const leanData = data.stats.map((s) => ({
    name: s.label,
    lean: Math.round(s.meanSigned * 100) / 100,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={sampleOn}
          onClick={() => setSampleOn((v) => !v)}
          className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors duration-[90ms] active:scale-[0.98] ${
            sampleOn
              ? "border-hairline-strong bg-paper text-ink"
              : "border-hairline bg-card text-graphite hover:text-ink"
          }`}
        >
          {sampleOn ? "Showing 10 sample enumerators" : "Preview with 10 sample enumerators"}
        </button>
        <button
          type="button"
          aria-pressed={chartsOn}
          onClick={() => setChartsOn((v) => !v)}
          className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors duration-[90ms] active:scale-[0.98] ${
            chartsOn
              ? "border-hairline-strong bg-paper text-ink"
              : "border-hairline bg-card text-graphite hover:text-ink"
          }`}
        >
          Charts &amp; statistics
        </button>
      </div>

      {sampleOn && (
        <p
          className="rounded-lg px-3 py-2 text-[13px] font-medium"
          style={{ background: "var(--clobs-lake-wash)", color: "var(--clobs-lake)" }}
        >
          Sample data, generated for preview only. Nothing here is stored or
          real; switch the toggle off to see the live dashboard.
        </p>
      )}

      {empty && !sampleOn ? (
        <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
          <p className="text-[15px] text-graphite">
            The dashboard fills once the gold set has master scores and
            trainees start submitting. Use the sample preview above to see
            its shape, or add gold videos on the Gold set screen.
          </p>
        </div>
      ) : (
        <>
          {chartsOn && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section aria-label="Exact agreement per trainee" className="elev-card rounded-2xl border border-hairline bg-card p-6">
                <h3 className="text-[15px] font-medium text-ink">
                  Exact agreement, against the 90% bar
                </h3>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={exactRates} layout="vertical" barSize={14}>
                      <CartesianGrid stroke="var(--clobs-hairline)" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fontSize: 12, fill: "var(--clobs-graphite)" }}
                        axisLine={false}
                        tickLine={false}
                        unit="%"
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={92}
                        interval={0}
                        tick={{ fontSize: 11, fill: "var(--clobs-graphite)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--clobs-sunken)" }} />
                      <ReferenceLine
                        x={THRESHOLD * 100}
                        stroke="var(--clobs-clay)"
                        strokeDasharray="4 3"
                        label={{ value: "90%", fill: "var(--clobs-clay)", fontSize: 11, position: "top" }}
                      />
                      <Bar dataKey="exact" name="Exact %" radius={[0, 4, 4, 0]}>
                        {exactRates.map((d) => (
                          <Cell
                            key={d.name}
                            fill={d.exact >= THRESHOLD * 100 ? "#2F7D4F" : "#7C9CBF"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[12px] text-smoke">
                  Green clears the provisional bar; blue is still below it.
                </p>
              </section>

              <section aria-label="Lean per trainee" className="elev-card rounded-2xl border border-hairline bg-card p-6">
                <h3 className="text-[15px] font-medium text-ink">
                  Who runs high, who runs low
                </h3>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leanData} layout="vertical" barSize={14}>
                      <CartesianGrid stroke="var(--clobs-hairline)" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[-1, 1]}
                        tick={{ fontSize: 12, fill: "var(--clobs-graphite)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={92}
                        interval={0}
                        tick={{ fontSize: 11, fill: "var(--clobs-graphite)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--clobs-sunken)" }} />
                      <ReferenceLine x={0} stroke="var(--clobs-hairline-strong)" />
                      <Bar dataKey="lean" name="Mean signed deviation" radius={[0, 4, 4, 0]} fill="#A9853F" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[12px] text-smoke">
                  Positive leans toward B·Very; negative toward A·Very. Zero
                  is calibrated.
                </p>
              </section>
            </div>
          )}

          {/* Reliability table */}
          <section aria-label="Reliability against the gold standard" className="space-y-3">
            <h3 className="text-[15px] font-medium text-ink">
              Agreement with the gold standard, across all videos
            </h3>
            <Table>
              <TableHeader>
                <TableRow header>
                  <TableHead>Trainee</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Exact</TableHead>
                  <TableHead>Adjacent (±1)</TableHead>
                  <TableHead>Weighted</TableHead>
                  <TableHead>Leans</TableHead>
                  <TableHead>A/B flips</TableHead>
                  <TableHead>Bar (90%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stats.map((s) => {
                  const exactRate = s.itemsCompared ? s.exact / s.itemsCompared : 0;
                  const passes = s.itemsCompared > 0 && exactRate >= THRESHOLD;
                  return (
                    <TableRow key={s.userId}>
                      <TableCell className="text-ink">{s.label}</TableCell>
                      <TableCell className="num text-graphite">{s.itemsCompared}</TableCell>
                      <TableCell className="num text-ink">
                        {pct(s.exact, s.itemsCompared)}
                        {s.itemsCompared > 0 && (
                          <span className="text-[12px] text-smoke"> ({s.exact}/{s.itemsCompared})</span>
                        )}
                      </TableCell>
                      <TableCell className="num text-graphite">
                        {pct(s.adjacent, s.itemsCompared)}
                      </TableCell>
                      <TableCell className="num text-graphite">
                        {s.itemsCompared ? s.weighted.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="num text-graphite">
                        {s.itemsCompared
                          ? s.meanSigned > 0.05
                            ? `+${s.meanSigned.toFixed(2)} (toward B)`
                            : s.meanSigned < -0.05
                              ? `${s.meanSigned.toFixed(2)} (toward A)`
                              : "balanced"
                          : "—"}
                      </TableCell>
                      <TableCell className={`num ${s.columnFlips > 0 ? "text-clay" : "text-graphite"}`}>
                        {s.itemsCompared ? s.columnFlips : "—"}
                      </TableCell>
                      <TableCell>
                        {s.itemsCompared === 0 ? (
                          <span className="text-[12px] text-smoke">no data</span>
                        ) : passes ? (
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                            style={{ background: "var(--clobs-forest-wash)", color: "var(--clobs-forest)" }}
                          >
                            above the bar
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                            style={{ background: "var(--clobs-sunken)", color: "var(--clobs-clay)" }}
                          >
                            below
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-[12px] leading-[1.5] text-smoke">
              Exact = same score. Adjacent = within one point. Weighted =
              quadratic agreement (1.00 is perfect; large misses cost more).
              Leans = mean signed deviation. A/B flips = disagreeing about the
              column itself, the serious kind of miss. The 90% bar is
              provisional (Amendment §29).
            </p>
          </section>

          {/* Per-video matrices */}
          {data.videos.map((v) => (
            <section key={v.videoId} aria-label={`Scores for ${v.displayCode}`} className="space-y-2">
              <h3 className="text-[15px] font-medium text-ink">
                <span className="video-code">{v.displayCode}</span>
              </h3>
              <Table>
                <TableHeader>
                  <TableRow header>
                    <TableHead>Item</TableHead>
                    <TableHead>Gold</TableHead>
                    {data.trainees.map((t) => (
                      <TableHead key={t.userId}>{t.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.items.map((item) => (
                    <TableRow key={item.itemNo}>
                      <TableCell className="num text-graphite">{item.itemNo}</TableCell>
                      <TableCell>
                        <span className="mono inline-flex size-6 items-center justify-center rounded-full bg-sunken text-[13px] font-semibold text-ink">
                          {item.gold}
                        </span>
                      </TableCell>
                      {data.trainees.map((t) => {
                        const mine = item.byTrainee[t.userId];
                        return (
                          <TableCell key={t.userId}>
                            <span
                              className="mono inline-flex size-6 items-center justify-center rounded-full text-[13px] font-medium"
                              style={cellTone(item.gold, mine)}
                            >
                              {mine ?? "—"}
                            </span>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
