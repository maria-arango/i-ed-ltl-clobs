"use client";
/**
 * The honest, boring autosave indicator (DESIGN_SYSTEM §9 example 5):
 * a small dot and a mono state word. Cross-fade only, no movement,
 * no spinner. aria-live so screen readers hear state changes.
 */
import type { SaveStatus } from "@/lib/use-autosave";

export function AutosaveIndicator({
  status,
  savedAt,
}: {
  status: SaveStatus;
  savedAt: Date | null;
}) {
  const time = savedAt
    ? savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const view = {
    idle: { dot: "var(--clobs-ash)", text: "—" },
    saving: { dot: "var(--clobs-ash)", text: "Saving…" },
    saved: { dot: "var(--clobs-forest)", text: time ? `Saved ${time}` : "Saved" },
    offline: { dot: "var(--clobs-clay)", text: "Offline. Saved on this device" },
  }[status];

  return (
    <span
      aria-live="polite"
      className="inline-flex items-center gap-2 text-[12px] text-smoke transition-opacity duration-[90ms] motion-reduce:transition-none"
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: view.dot }}
      />
      <span className="mono">{view.text}</span>
    </span>
  );
}
