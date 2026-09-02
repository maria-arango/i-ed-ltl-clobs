"use client";
/**
 * The coder's personal dashboard (Amendment §38): how I code — my score
 * distribution across the four options (ordinal → one-hue ramp), where I
 * sit per concept relative to the A/B divide, and a few honest tiles.
 * Everything here is the coder's OWN data.
 */
import { useState } from "react";
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
import { NumberTicker } from "@/components/ui/number-ticker";
import type { MyCodingStats } from "@/lib/db/coder";

const RAMP = ["#D9E4F0", "#A9C1DC", "#4F7AA6", "#2C5C8F"]; // scores 1→4
const SCORE_LABEL: Record<number, string> = {
  1: "A · Very",
  2: "A · Somewhat",
  3: "B · Somewhat",
  4: "B · Very",
};

const TOOLTIP_STYLE = {
  background: "var(--clobs-paper)",
  border: "1px solid var(--clobs-hairline-strong)",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--clobs-ink)",
};

export function MyDashboard({
  stats,
  conceptNames,
}: {
  stats: MyCodingStats;
  conceptNames: Record<number, string>;
}) {
  // Captured once on mount — render stays pure.
  const [now] = useState(() => Date.now());
  if (stats.submittedVideos === 0) {
    return (
      <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
        <p className="text-[15px] text-graphite">
          Your dashboard fills after your first submitted video: how your
          scores distribute, where you sit per concept, and your pace.
        </p>
      </div>
    );
  }

  const distData = ([1, 2, 3, 4] as const).map((n) => ({
    name: SCORE_LABEL[n],
    count: stats.distribution[n],
    fill: RAMP[n - 1],
  }));
  const itemData = stats.perItem.map((i) => ({
    name: `${i.itemNo} · ${conceptNames[i.itemNo] ?? `Concept ${i.itemNo}`}`,
    mean: Math.round(i.mean * 100) / 100,
  }));

  return (
    <div className="space-y-6">
      <section
        aria-label="My totals"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { n: stats.submittedVideos, label: "videos submitted" },
          { n: stats.scoredItems, label: "concepts scored" },
          { n: stats.avgJustificationWords, label: "avg words per justification" },
          {
            n: stats.lastSubmittedAt
              ? Math.max(
                  0,
                  Math.round(
                    (now - new Date(stats.lastSubmittedAt).getTime()) / 86400000,
                  ),
                )
              : 0,
            label: "days since last submission",
          },
        ].map((c) => (
          <div
            key={c.label}
            className="elev-card rounded-2xl border border-hairline bg-card p-4"
          >
            <p className="text-[26px] leading-[1.2] text-ink">
              <NumberTicker value={c.n} />
            </p>
            <p className="mt-1 text-[12px] text-graphite">{c.label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-label="My score distribution"
          className="elev-card rounded-2xl border border-hairline bg-card p-6"
        >
          <h3 className="text-[15px] font-medium text-ink">
            How my scores distribute
          </h3>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData} barSize={40}>
                <CartesianGrid stroke="var(--clobs-hairline)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--clobs-graphite)" }}
                  axisLine={{ stroke: "var(--clobs-hairline-strong)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--clobs-graphite)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: "var(--clobs-sunken)" }}
                />
                <Bar dataKey="count" name="Times chosen" radius={[4, 4, 0, 0]}>
                  {distData.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section
          aria-label="My mean score per concept"
          className="elev-card rounded-2xl border border-hairline bg-card p-6"
        >
          <h3 className="text-[15px] font-medium text-ink">
            Where I sit per concept
          </h3>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={itemData} layout="vertical" barSize={12}>
                <CartesianGrid stroke="var(--clobs-hairline)" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[1, 4]}
                  ticks={[1, 2, 3, 4]}
                  tick={{ fontSize: 12, fill: "var(--clobs-graphite)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={170}
                  interval={0}
                  tick={{ fontSize: 11, fill: "var(--clobs-graphite)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: "var(--clobs-sunken)" }}
                />
                <ReferenceLine
                  x={2.5}
                  stroke="var(--clobs-clay)"
                  strokeDasharray="4 3"
                  label={{
                    value: "A | B",
                    fill: "var(--clobs-clay)",
                    fontSize: 11,
                    position: "top",
                  }}
                />
                <Bar
                  dataKey="mean"
                  name="My mean score"
                  fill="#4F7AA6"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[12px] text-smoke">
            Left of the dashed line leans toward Column A, right leans toward
            Column B. This is your tendency, not a verdict.
          </p>
        </section>
      </div>
    </div>
  );
}
