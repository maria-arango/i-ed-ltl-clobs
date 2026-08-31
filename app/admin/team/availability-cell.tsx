"use client";
/**
 * Inline availability editor: videos/day with a date range (Amendment B
 * §18). History is preserved server-side; this only starts a new entry.
 */
import { useState, useTransition } from "react";
import { setAvailabilityAction } from "./actions";

export function AvailabilityCell({
  userId,
  current,
}: {
  userId: string;
  current: { videosPerDay: number; effectiveFrom: string; effectiveTo: string | null } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [vpd, setVpd] = useState(current?.videosPerDay ?? 3);
  const [from, setFrom] = useState(
    current?.effectiveFrom?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(current?.effectiveTo?.slice(0, 10) ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Edit availability"
        className="rounded-sm text-left text-[13px] text-graphite underline-offset-2 hover:text-lake hover:underline"
      >
        {current ? (
          <>
            <span className="num">{current.videosPerDay}</span>/day
            <span className="text-smoke">
              {" "}
              from {current.effectiveFrom.slice(0, 10)}
              {current.effectiveTo ? ` to ${current.effectiveTo.slice(0, 10)}` : ""}
            </span>
          </>
        ) : (
          <span className="text-smoke">3/day (default)</span>
        )}
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[12px]">
      <input
        type="number"
        min={0}
        max={6}
        step={0.5}
        value={vpd}
        onChange={(e) => setVpd(Number(e.target.value))}
        aria-label="Videos per day"
        className="w-16 rounded-sm border border-hairline bg-paper px-1.5 py-1 text-ink focus:border-hairline-strong"
      />
      <span className="text-smoke">/day</span>
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        aria-label="From date"
        className="rounded-sm border border-hairline bg-paper px-1.5 py-1 text-ink focus:border-hairline-strong"
      />
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        aria-label="Until date (optional)"
        className="rounded-sm border border-hairline bg-paper px-1.5 py-1 text-ink focus:border-hairline-strong"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await setAvailabilityAction(userId, vpd, from, to || null);
            if (!r.ok) setError(r.error ?? "Failed");
            else setEditing(false);
          })
        }
        className="rounded-sm px-2 py-1 font-semibold text-lake underline-offset-2 hover:underline disabled:text-ash"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-sm px-1 py-1 text-smoke hover:underline"
      >
        Cancel
      </button>
      {error && <span className="text-clay">{error}</span>}
    </span>
  );
}
