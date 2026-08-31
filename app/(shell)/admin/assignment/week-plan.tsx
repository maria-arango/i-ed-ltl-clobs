"use client";
/**
 * The weekly flow (Amendment B §25), top to bottom on one screen:
 *   1. choose the week (dates),
 *   2. mark who is working that week and at how many videos/day,
 *   3. preview the seeded wave (sized by that availability) and confirm.
 * Preview writes nothing; confirming writes exactly what was previewed.
 */
import { useActionState, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import {
  confirmWaveAction,
  previewWaveAction,
  setWeekPlanAction,
  type WaveActionResult,
  type WeekPlanActionResult,
} from "./actions";

const inputCls =
  "rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink focus:border-hairline-strong";

export interface RosterRow {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  isChiefCoder: boolean;
  videosPerDay: number;
}

function weekdaysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let n = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function WeekPlan({
  roster,
  defaultWeekStart,
  poolSize,
}: {
  roster: RosterRow[];
  defaultWeekStart: string;
  poolSize: number;
}) {
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [weekEnd, setWeekEnd] = useState(addDaysIso(defaultWeekStart, 4));
  const [plan, setPlan] = useState<Record<string, { working: boolean; vpd: number }>>(
    Object.fromEntries(
      roster.map((r) => [
        r.userId,
        { working: r.videosPerDay > 0, vpd: r.videosPerDay > 0 ? r.videosPerDay : 3 },
      ]),
    ),
  );
  const [seed, setSeed] = useState("");
  const workingDays = weekdaysBetween(weekStart, weekEnd);
  const effectiveSeed = seed.trim() || `week-${weekStart}`;

  const [planState, planAction, planPending] = useActionState<
    WeekPlanActionResult | null,
    FormData
  >(setWeekPlanAction, null);
  const [previewState, previewAction, previewPending] = useActionState<
    WaveActionResult | null,
    FormData
  >(previewWaveAction, null);
  const [confirmState, confirmAction, confirmPending] = useActionState<
    WaveActionResult | null,
    FormData
  >(confirmWaveAction, null);

  const preview =
    previewState?.ok && previewState.preview && !confirmState?.ok
      ? previewState.preview
      : null;

  const entriesJson = useMemo(
    () =>
      JSON.stringify(
        roster.map((r) => ({
          userId: r.userId,
          videosPerDay: plan[r.userId]?.working ? plan[r.userId].vpd : 0,
        })),
      ),
    [roster, plan],
  );

  const label = (r: RosterRow) => r.name ?? r.email;

  return (
    <section aria-label="Plan the week" className="space-y-4">
      <h2
        className="font-sans font-medium text-ink"
        style={{
          fontSize: "var(--clobs-text-heading-sm)",
          lineHeight: "var(--clobs-leading-heading-sm)",
          letterSpacing: "var(--clobs-tracking-heading-sm)",
        }}
      >
        Plan a week
      </h2>

      {/* 1 · the week */}
      <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke">
          1 · Choose the week
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="block text-[14px] font-medium text-ink">
            From
            <input
              type="date"
              value={weekStart}
              onChange={(e) => {
                setWeekStart(e.target.value);
                if (e.target.value) setWeekEnd(addDaysIso(e.target.value, 4));
              }}
              className={`mt-1 block ${inputCls}`}
            />
          </label>
          <label className="block text-[14px] font-medium text-ink">
            To
            <input
              type="date"
              value={weekEnd}
              min={weekStart}
              onChange={(e) => setWeekEnd(e.target.value)}
              className={`mt-1 block ${inputCls}`}
            />
          </label>
          <p className="pb-2 text-[13px] text-graphite">
            <span className="mono">{workingDays}</span> working day
            {workingDays === 1 ? "" : "s"} (weekends don&apos;t count)
          </p>
        </div>
      </div>

      {/* 2 · the people */}
      <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke">
          2 · Who codes this week
        </p>
        <p className="mt-2 text-[13px] leading-[1.5] text-graphite">
          Untick anyone who is away; set videos per day for everyone else (3
          is full time). Saving records this for the chosen week only; other
          weeks keep their own plans.
        </p>
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Working</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Videos per day</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((r) => {
                const p = plan[r.userId];
                return (
                  <TableRow key={r.userId} className={p.working ? "" : "opacity-55"}>
                    <TableCell>
                      <Checkbox
                        aria-label={`${label(r)} works this week`}
                        checked={p.working}
                        onCheckedChange={(checked) =>
                          setPlan((prev) => ({
                            ...prev,
                            [r.userId]: { ...p, working: checked === true },
                          }))
                        }
                        size="sm"
                        className="border-hairline-strong"
                      />
                    </TableCell>
                    <TableCell className="text-ink">{label(r)}</TableCell>
                    <TableCell className="text-[13px] text-graphite">
                      {r.role === "admin" ? "admin" : r.isChiefCoder ? "chief coder" : "coder"}
                    </TableCell>
                    <TableCell>
                      <input
                        type="number"
                        min={0.5}
                        max={6}
                        step={0.5}
                        aria-label={`Videos per day for ${label(r)}`}
                        value={p.vpd}
                        disabled={!p.working}
                        onChange={(e) =>
                          setPlan((prev) => ({
                            ...prev,
                            [r.userId]: { ...p, vpd: Number(e.target.value) },
                          }))
                        }
                        className={`w-24 ${inputCls} disabled:text-ash`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <form action={planAction} className="mt-4 flex items-center justify-between gap-4">
          <input type="hidden" name="weekStart" value={weekStart} />
          <input type="hidden" name="weekEnd" value={weekEnd} />
          <input type="hidden" name="entries" value={entriesJson} />
          <span aria-live="polite" className="text-[13px]">
            {planState && !planState.ok && (
              <span className="text-clay">{planState.error}</span>
            )}
            {planState?.ok && (
              <span style={{ color: "var(--clobs-forest)" }}>
                Week plan saved
                {planState.changed ? ` (${planState.changed} updated)` : " (no changes)"}.
              </span>
            )}
          </span>
          <button
            type="submit"
            disabled={planPending}
            className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:text-ash"
          >
            {planPending ? "Saving…" : "Save week plan"}
          </button>
        </form>
      </div>

      {/* 3 · the wave */}
      <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke">
          3 · Deal the videos
        </p>
        <p className="mt-2 text-[13px] leading-[1.5] text-graphite">
          The algorithm deals the pool ({poolSize} videos) to the active pairs.
          Each pair&apos;s share is its slower member&apos;s videos per day (from the
          plan above) times the {workingDays} working days. Arm-balanced within
          every pair, schools spread, card duty split. Preview writes nothing.
        </p>
        <form action={previewAction} className="mt-4 flex flex-wrap items-end gap-4">
          <input type="hidden" name="weekStart" value={weekStart} />
          <input type="hidden" name="waveDays" value={Math.max(workingDays, 1)} />
          <label className="block text-[14px] font-medium text-ink">
            Seed
            <input
              name="seed"
              value={effectiveSeed}
              onChange={(e) => setSeed(e.target.value)}
              className={`mono mt-1 block w-64 ${inputCls}`}
            />
          </label>
          <button
            type="submit"
            disabled={previewPending || workingDays === 0}
            className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:text-ash"
          >
            {previewPending ? "Computing…" : "Preview the wave"}
          </button>
        </form>
        <div aria-live="polite" className="mt-2 text-[13px]">
          {previewState && !previewState.ok && (
            <span className="text-clay">{previewState.error}</span>
          )}
          {confirmState && !confirmState.ok && (
            <span className="text-clay">{confirmState.error}</span>
          )}
        </div>
      </div>

      {confirmState?.ok && confirmState.confirmed && (
        <div
          role="status"
          className="flex items-center gap-4 rounded-2xl border border-hairline p-5"
          style={{ background: "var(--clobs-forest-wash)" }}
        >
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--clobs-forest)", color: "var(--clobs-paper)" }}
          >
            ✓
          </span>
          <p className="text-[15px] text-ink">
            Wave {confirmState.confirmed.waveNo} confirmed:{" "}
            <span className="mono">{confirmState.confirmed.assigned}</span>{" "}
            videos assigned. Coders can see their new videos and who their
            partner is in My videos.
          </p>
        </div>
      )}

      {preview && (
        <div className="elev-card space-y-3 rounded-2xl border border-hairline-strong bg-paper p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[15px] font-medium text-ink">
              Preview: wave {preview.waveNo}, week of {preview.weekStart},{" "}
              <span className="mono text-[13px]">{preview.seed}</span>
            </h4>
            <p className="text-[13px] text-graphite">
              {preview.totalToAssign} of {preview.poolSize} pool videos would be
              assigned
              {preview.skippedNoArm > 0 &&
                ` · ${preview.skippedNoArm} held back (school arm unresolved)`}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Pair</TableHead>
                <TableHead>Videos (of capacity)</TableHead>
                <TableHead>Control / Dispersed / Connected</TableHead>
                <TableHead>Max same school</TableHead>
                <TableHead>Cards (anchor)</TableHead>
                <TableHead>First codes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.perPair.map((p) => (
                <TableRow key={p.pairId}>
                  <TableCell className="text-ink">{p.label}</TableCell>
                  <TableCell className="num">
                    {p.count} of {p.capacity}
                  </TableCell>
                  <TableCell className="num text-graphite">
                    {p.arms.control} / {p.arms.dispersed} / {p.arms.connected}
                  </TableCell>
                  <TableCell className="num text-graphite">{p.maxSameSchool}</TableCell>
                  <TableCell className="num text-graphite">
                    {p.anchorFillsCards} of {p.count}
                  </TableCell>
                  <TableCell className="mono text-[12px] text-smoke">
                    {p.sampleCodes.join(" ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <form action={confirmAction} className="flex items-center justify-end gap-3">
            <input type="hidden" name="seed" value={preview.seed} />
            <input type="hidden" name="weekStart" value={preview.weekStart} />
            <input type="hidden" name="waveDays" value={preview.waveDays} />
            <input type="hidden" name="hash" value={preview.hash} />
            <p className="text-[13px] text-graphite">
              Confirming writes these assignments. Coders see the new videos in
              their queues.
            </p>
            <button
              type="submit"
              disabled={confirmPending}
              className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
            >
              {confirmPending ? "Writing…" : `Confirm wave ${preview.waveNo}`}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
