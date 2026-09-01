"use client";
/** Decide one access request: training, live, or decline (Amendment §35). */
import { useState, useTransition } from "react";
import { PillButton } from "@/components/ui/pill-button";
import { decideRequestAction } from "./actions";

export function RequestActions({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const decide = (decision: "approved_training" | "approved_live" | "declined") =>
    startTransition(async () => {
      setError(null);
      const r = await decideRequestAction(requestId, decision);
      if (!r.ok) setError(r.error ?? "Something went wrong");
    });

  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {error && <span className="text-[12px] text-clay">{error}</span>}
      <PillButton disabled={pending} onClick={() => decide("approved_training")}>
        Grant training access
      </PillButton>
      <PillButton disabled={pending} onClick={() => decide("approved_live")}>
        Grant live coding
      </PillButton>
      <PillButton variant="danger" disabled={pending} onClick={() => decide("declined")}>
        Decline
      </PillButton>
    </span>
  );
}
