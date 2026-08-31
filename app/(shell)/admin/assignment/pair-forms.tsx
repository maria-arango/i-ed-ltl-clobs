"use client";
/**
 * Pair controls. Manual pair CREATION was removed 2026-08-31 (Amendment B
 * §26): rotation is the pairing mechanism; dissolving an empty pair stays
 * for corrections.
 */
import { useState, useTransition } from "react";
import { dissolvePairAction } from "./actions";

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
