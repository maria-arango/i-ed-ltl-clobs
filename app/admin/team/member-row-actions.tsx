"use client";
/**
 * Per-member row actions: chief toggle, promote/demote, deactivate or
 * reactivate, and permanent deletion (allowed only for accounts with no
 * work; anything evidentiary can only be deactivated, Amendment B §20).
 */
import { useState, useTransition } from "react";
import {
  deleteMemberAction,
  setActiveAction,
  setChiefAction,
  setRoleAction,
} from "./actions";

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong");
    });

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {error && <span className="max-w-72 text-right text-[12px] text-clay">{error}</span>}
      {!isSelf && isActive && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => setRoleAction(userId, role === "admin" ? "coder" : "admin"))
          }
          className={ghostBtn}
        >
          {role === "admin" ? "Make coder" : "Make admin"}
        </button>
      )}
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
      {!isSelf && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirmingDelete) {
              setConfirmingDelete(true);
              setTimeout(() => setConfirmingDelete(false), 4000);
              return;
            }
            setConfirmingDelete(false);
            run(() => deleteMemberAction(userId));
          }}
          className="rounded-sm px-2 py-1 text-[12px] text-clay underline-offset-2 hover:underline disabled:text-ash"
        >
          {confirmingDelete ? "Click again: delete forever" : "Delete"}
        </button>
      )}
    </span>
  );
}
