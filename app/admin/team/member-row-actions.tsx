"use client";
/** Per-member row actions: chief toggle, deactivate/reactivate. */
import { useState, useTransition } from "react";
import { setActiveAction, setChiefAction } from "./actions";

const ghostBtn =
  "rounded-sm px-2 py-1 text-[12px] text-graphite underline-offset-2 hover:underline disabled:text-ash";

export function MemberRowActions({
  userId,
  role,
  isChiefCoder,
  isActive,
  isSelf,
}: {
  userId: string;
  role: "admin" | "coder";
  isChiefCoder: boolean;
  isActive: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong");
    });

  return (
    <span className="flex items-center justify-end gap-2">
      {error && <span className="text-[12px] text-clay">{error}</span>}
      {role === "coder" && isActive && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setChiefAction(userId, !isChiefCoder))}
          className={ghostBtn}
        >
          {isChiefCoder ? "Remove chief" : "Make chief"}
        </button>
      )}
      {!isSelf && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setActiveAction(userId, !isActive))}
          className={`${ghostBtn} ${isActive ? "hover:text-clay" : ""}`}
        >
          {isActive ? "Deactivate" : "Reactivate"}
        </button>
      )}
    </span>
  );
}
