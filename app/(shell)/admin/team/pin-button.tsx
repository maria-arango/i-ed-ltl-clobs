"use client";
/**
 * Set or reset a person's sign-in PIN (ADR 0003). The new PIN is shown
 * once, here, to pass on privately; the platform stores only its hash.
 */
import { useState, useTransition } from "react";
import { setPinAction } from "./actions";

export function PinButton({
  userId,
  hasPin,
  locked,
}: {
  userId: string;
  hasPin: boolean;
  locked: "temporary" | "hard" | null;
}) {
  const [pin, setPin] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (pin) {
    return (
      <span className="mr-1.5 inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-paper px-2 py-1 text-[12px]">
        New code <strong className="text-[14px] tracking-[0.2em] text-ink">{pin}</strong>
        <span className="text-smoke">shown once</span>
        <button type="button" onClick={() => setPin(null)} className="text-lake underline">
          Done
        </button>
      </span>
    );
  }
  return (
    <span className="mr-1.5 inline-flex items-center gap-1.5">
      {locked && (
        <span className="text-[12px] font-medium text-clay">{locked === "hard" ? "Locked" : "Locked (temporary)"}</span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (hasPin && !window.confirm("Give this person a new 4-digit code? Their old code stops working.")) return;
          start(async () => {
            const r = await setPinAction(userId);
            if (r.ok && r.pin) setPin(r.pin);
            else if (!r.ok) window.alert(r.error);
          });
        }}
        className="inline-block rounded-full border border-hairline-strong bg-paper px-3 py-1 text-[12px] font-medium text-ink hover:bg-card"
      >
        {hasPin ? (locked ? "Unlock + new code" : "New code") : "Set code"}
      </button>
    </span>
  );
}
