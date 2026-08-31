"use client";
/**
 * Run an assignment wave: preview (nothing written) → confirm (written
 * exactly as previewed — the server re-runs the same seed and refuses if
 * the pool changed). The preview shows the balance evidence the paper
 * will cite: per-pair arm mix, school repeats, card-duty split.
 */
import { useActionState, useState } from "react";
import {
  confirmWaveAction,
  previewWaveAction,
  type WaveActionResult,
} from "./actions";

const inputCls =
  "rounded-md border border-hairline bg-paper px-3 py-2.5 text-[15px] text-ink focus:border-hairline-strong";

function defaultSeed(waveNo: number): string {
  const d = new Date().toISOString().slice(0, 10);
  return `wave-${waveNo}-${d}`;
}

export function WaveRunner({ nextWaveNo, poolSize }: { nextWaveNo: number; poolSize: number }) {
  const [seed, setSeed] = useState(defaultSeed(nextWaveNo));
  const [waveDays, setWaveDays] = useState(5);
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

  return (
    <section aria-label="Run an assignment wave" className="space-y-4">
      <div className="rounded-xl border border-hairline bg-card p-6">
        <h3 className="text-[15px] font-medium text-ink">Run a wave</h3>
        <p className="mt-1 max-w-[62ch] text-[13px] leading-[1.5] text-graphite">
          The algorithm deals the pool ({poolSize} videos) to the active
          pairs. Each pair&apos;s share comes from its members&apos; availability
          (videos per day, set on the Team screen) times the working days
          you choose here. Arm-balanced within every pair, schools spread,
          card duty split. Preview writes nothing; confirming writes exactly
          what you previewed, recorded with its seed.
        </p>
        <form action={previewAction} className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block text-[14px] font-medium text-ink">
            Working days in this wave
            <input
              name="waveDays"
              type="number"
              min={1}
              max={20}
              value={waveDays}
              onChange={(e) => setWaveDays(Number(e.target.value))}
              className={`mt-1 block w-32 ${inputCls}`}
            />
          </label>
          <label className="block text-[14px] font-medium text-ink">
            Seed
            <input
              name="seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className={`mono mt-1 block w-64 ${inputCls}`}
            />
          </label>
          <button
            type="submit"
            disabled={previewPending}
            className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[15px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:text-ash"
          >
            {previewPending ? "Computing…" : "Preview wave"}
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
          className="flex items-center gap-4 rounded-xl border border-hairline p-5"
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
            videos assigned. Coders will see them in their queues now.
          </p>
        </div>
      )}

      {preview && (
        <div className="space-y-3 rounded-xl border border-hairline-strong bg-paper p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[15px] font-medium text-ink">
              Preview: wave {preview.waveNo},{" "}
              <span className="mono text-[13px]">{preview.seed}</span>
            </h4>
            <p className="text-[13px] text-graphite">
              {preview.totalToAssign} of {preview.poolSize} pool videos would
              be assigned
              {preview.skippedNoArm > 0 &&
                ` · ${preview.skippedNoArm} held back (school arm unresolved)`}
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead>
                <tr className="bg-sunken text-[12px] text-graphite">
                  <th className="px-4 py-2 font-semibold">Pair</th>
                  <th className="px-4 py-2 font-semibold">Videos (of capacity)</th>
                  <th className="px-4 py-2 font-semibold">Control / Dispersed / Connected</th>
                  <th className="px-4 py-2 font-semibold">Max same school</th>
                  <th className="px-4 py-2 font-semibold">Cards (anchor)</th>
                  <th className="px-4 py-2 font-semibold">First codes</th>
                </tr>
              </thead>
              <tbody>
                {preview.perPair.map((p) => (
                  <tr key={p.pairId} className="h-10 border-t border-hairline">
                    <td className="px-4 text-ink">{p.label}</td>
                    <td className="num px-4">
                      {p.count} of {p.capacity}
                    </td>
                    <td className="num px-4 text-graphite">
                      {p.arms.control} / {p.arms.dispersed} / {p.arms.connected}
                    </td>
                    <td className="num px-4 text-graphite">{p.maxSameSchool}</td>
                    <td className="num px-4 text-graphite">
                      {p.anchorFillsCards} of {p.count}
                    </td>
                    <td className="mono px-4 text-[12px] text-smoke">
                      {p.sampleCodes.join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={confirmAction} className="flex items-center justify-end gap-3">
            <input type="hidden" name="seed" value={preview.seed} />
            <input type="hidden" name="waveDays" value={preview.waveDays} />
            <input type="hidden" name="hash" value={preview.hash} />
            <p className="text-[13px] text-graphite">
              Confirming writes these assignments. Coders simply see new videos
              in their queues.
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
