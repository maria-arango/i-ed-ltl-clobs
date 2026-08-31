"use client";
/**
 * Client widgets for the gold set screen: search-and-flag a video into the
 * gold set, and the certification decision buttons.
 */
import { useActionState, useState, useTransition } from "react";
import { PillButton } from "@/components/ui/pill-button";
import {
  certifyAction,
  searchGoldAction,
  setGoldAction,
  type GoldSearchResult,
} from "./actions";

export function AddGoldSearch() {
  const [state, action, pending] = useActionState<GoldSearchResult | null, FormData>(
    searchGoldAction,
    null,
  );
  const [flagging, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
      <h3 className="text-[15px] font-medium text-ink">Add a video to the gold set</h3>
      <p className="mt-1 text-[13px] leading-[1.5] text-graphite">
        Search by the session filename (e.g. 10403_10403_16) or the display
        code. Marking a video gold never changes what coders see; the flag
        and the master scores live in admin-only tables.
      </p>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-[14px] font-medium text-ink">
          Filename or code
          <input
            name="q"
            className="mono mt-1 block w-72 rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink focus:border-hairline-strong"
            placeholder="10403_10403_16…"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:text-ash"
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </form>
      <div aria-live="polite" className="mt-3 space-y-2 text-[13px]">
        {state && !state.ok && <p className="text-clay">{state.error}</p>}
        {error && <p className="text-clay">{error}</p>}
        {state?.ok && state.results?.length === 0 && (
          <p className="text-graphite">No codable videos match.</p>
        )}
        {state?.ok &&
          state.results?.map((r) => (
            <div
              key={r.videoId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-paper px-3 py-2"
            >
              <span className="mono text-[12px] text-graphite">
                {r.rawFilename}{" "}
                <span className="video-code text-ink">{r.displayCode}</span>
              </span>
              {r.isGold ? (
                <span className="text-[12px]" style={{ color: "var(--clobs-forest)" }}>
                  Already in the gold set
                </span>
              ) : (
                <PillButton
                  disabled={flagging}
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      const res = await setGoldAction(r.videoId, true);
                      if (!res.ok) setError(res.error ?? "Something went wrong");
                    })
                  }
                >
                  Mark as gold
                </PillButton>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

export function CertifyButtons({
  userId,
  disabled,
}: {
  userId: string;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = (decision: "passed" | "failed") =>
    startTransition(async () => {
      setError(null);
      const r = await certifyAction(userId, decision);
      if (!r.ok) setError(r.error ?? "Something went wrong");
      setConfirming(false);
    });

  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {error && <span className="text-[12px] text-clay">{error}</span>}
      <PillButton
        disabled={pending || disabled}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            setTimeout(() => setConfirming(false), 4000);
            return;
          }
          decide("passed");
        }}
      >
        {confirming ? "Click again: promote to live" : "Certify · promote to live"}
      </PillButton>
      <PillButton variant="danger" disabled={pending || disabled} onClick={() => decide("failed")}>
        Record a fail
      </PillButton>
    </span>
  );
}
