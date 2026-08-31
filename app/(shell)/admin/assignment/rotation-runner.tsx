"use client";
/**
 * Weekly pair rotation (Amendment B §19): seeded proposal, preferring
 * people who have not worked together, sized by anchor availability.
 * Preview writes nothing; confirm dissolves the current pairs (history
 * intact) and forms the new set.
 */
import { useActionState, useState } from "react";
import {
  confirmRotationAction,
  previewRotationAction,
  type RotationActionResult,
} from "./actions";

const inputCls =
  "rounded-md border border-hairline bg-paper px-3 py-2.5 text-[15px] text-ink focus:border-hairline-strong";

export function RotationRunner() {
  const [seed, setSeed] = useState(
    `pairs-${new Date().toISOString().slice(0, 10)}`,
  );
  const [previewState, previewAction, previewPending] = useActionState<
    RotationActionResult | null,
    FormData
  >(previewRotationAction, null);
  const [confirmState, confirmAction, confirmPending] = useActionState<
    RotationActionResult | null,
    FormData
  >(confirmRotationAction, null);

  const preview =
    previewState?.ok && previewState.preview && !confirmState?.ok
      ? previewState.preview
      : null;

  return (
    <div className="space-y-3">
      <div className="elev-card rounded-xl border border-hairline bg-card p-6">
        <h3 className="text-[15px] font-medium text-ink">
          Rotate pairs for a new week
        </h3>
        <p className="mt-1 text-[13px] leading-[1.5] text-graphite">
          Randomised pairings that prefer people who have not worked together
          yet, sized by each anchor&apos;s availability. Current pairs are
          retired (their history and calibrations stay intact) and the new
          set is formed. You can still form or adjust pairs by hand below.
        </p>
        <form action={previewAction} className="mt-4 flex flex-wrap items-end gap-4">
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
            {previewPending ? "Computing…" : "Preview rotation"}
          </button>
        </form>
        <div aria-live="polite" className="mt-2 text-[13px]">
          {previewState && !previewState.ok && (
            <span className="text-clay">{previewState.error}</span>
          )}
          {confirmState && !confirmState.ok && (
            <span className="text-clay">{confirmState.error}</span>
          )}
          {confirmState?.ok && confirmState.confirmed && (
            <span style={{ color: "var(--clobs-forest)" }}>
              Rotation confirmed: {confirmState.confirmed.formed} pairs formed.
            </span>
          )}
        </div>
      </div>

      {preview && (
        <div className="elev-card space-y-3 rounded-xl border border-hairline-strong bg-paper p-5">
          <h4 className="text-[15px] font-medium text-ink">
            Proposed pairs (<span className="mono text-[13px]">{preview.seed}</span>)
          </h4>
          <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
            {preview.proposals.map((p) => (
              <li
                key={`${p.anchor.id}-${p.enumerator.id}`}
                className="flex h-10 items-center gap-3 px-4 text-[14px]"
              >
                <span className="text-ink">{p.anchor.label}</span>
                <span aria-hidden className="text-smoke">×</span>
                <span className="flex-1 text-ink">{p.enumerator.label}</span>
                {p.workedTogetherBefore === 0 ? (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                    style={{ background: "var(--clobs-forest-wash)", color: "var(--clobs-forest)" }}
                  >
                    new pairing
                  </span>
                ) : (
                  <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[11px] text-graphite">
                    worked together {p.workedTogetherBefore}×
                  </span>
                )}
              </li>
            ))}
          </ul>
          {preview.unmatchedEnumerators.length > 0 && (
            <p className="text-[13px] text-clay">
              Unmatched (no anchor capacity): {preview.unmatchedEnumerators.join(", ")}
            </p>
          )}
          <form action={confirmAction} className="flex items-center justify-end gap-3">
            <input type="hidden" name="seed" value={preview.seed} />
            <input type="hidden" name="hash" value={preview.hash} />
            <button
              type="submit"
              disabled={confirmPending}
              className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
            >
              {confirmPending ? "Forming…" : "Confirm rotation"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
