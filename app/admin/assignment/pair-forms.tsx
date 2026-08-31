"use client";
/** Pair creation + dissolve controls for the Assignment screen. */
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  createPairAction,
  dissolvePairAction,
  type PairActionResult,
} from "./actions";

const inputCls =
  "w-full rounded-md border border-hairline bg-paper px-3 py-2.5 text-[15px] text-ink focus:border-hairline-strong";

export interface Candidate {
  id: string;
  name: string | null;
  email: string;
}

export function CreatePairForm({
  anchors,
  enumerators,
}: {
  anchors: Candidate[];
  enumerators: Candidate[];
}) {
  const [result, formAction, pending] = useActionState<PairActionResult | null, FormData>(
    createPairAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result]);

  const nameOf = (c: Candidate) => c.name ?? c.email;

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-hairline bg-card p-6">
      <h3 className="text-[15px] font-medium text-ink">Form a pair</h3>
      <p className="mt-1 max-w-[60ch] text-[13px] leading-[1.5] text-graphite">
        Every pair is one anchor (an admin or chief coder) and one enumerator
        — enumerators are never paired together.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-[14px] font-medium text-ink">
          Anchor
          <select name="anchorId" required defaultValue="" className={`mt-1 ${inputCls}`}>
            <option value="" disabled>
              Choose…
            </option>
            {anchors.map((c) => (
              <option key={c.id} value={c.id}>
                {nameOf(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[14px] font-medium text-ink">
          Enumerator
          <select name="enumeratorId" required defaultValue="" className={`mt-1 ${inputCls}`}>
            <option value="" disabled>
              Choose…
            </option>
            {enumerators.map((c) => (
              <option key={c.id} value={c.id}>
                {nameOf(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <span aria-live="polite" className="text-[13px]">
          {result && !result.ok && <span className="text-clay">{result.error}</span>}
          {result?.ok && (
            <span style={{ color: "var(--clobs-forest)" }}>Pair formed.</span>
          )}
        </span>
        <button
          type="submit"
          disabled={pending || enumerators.length === 0}
          className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[15px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:cursor-not-allowed disabled:text-ash"
        >
          {pending ? "Forming…" : "Form pair"}
        </button>
      </div>
      {enumerators.length === 0 && (
        <p className="mt-2 text-[13px] text-graphite">
          No eligible enumerators yet — add coders on the Team screen first.
        </p>
      )}
    </form>
  );
}

export function DissolveButton({ pairId }: { pairId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  return (
    <span className="flex items-center justify-end gap-2">
      {error && <span className="max-w-64 text-right text-[12px] text-clay">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            setTimeout(() => setConfirming(false), 4000);
            return;
          }
          startTransition(async () => {
            setError(null);
            const r = await dissolvePairAction(pairId);
            if (!r.ok) setError(r.error ?? "Something went wrong");
            setConfirming(false);
          });
        }}
        className="rounded-sm px-2 py-1 text-[12px] text-graphite underline-offset-2 hover:text-clay hover:underline disabled:text-ash"
      >
        {confirming ? "Click again to dissolve" : "Dissolve"}
      </button>
    </span>
  );
}
