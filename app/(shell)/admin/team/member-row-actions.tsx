"use client";
/**
 * Per-member actions, as pill buttons under the "Actions" column: chief
 * toggle, promote/demote, deactivate or reactivate, and permanent deletion
 * (allowed only for accounts with no work; anything evidentiary can only
 * be deactivated, Amendment B §20).
 */
import { useState, useTransition } from "react";
import { PillButton } from "@/components/ui/pill-button";
import {
  deleteMemberAction,
  setActiveAction,
  setChiefAction,
  setRoleAction,
} from "./actions";

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
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {error && (
        <span className="max-w-72 text-right text-[12px] text-clay">{error}</span>
      )}
      {!isSelf && isActive && (
        <PillButton
          disabled={pending}
          onClick={() =>
            run(() => setRoleAction(userId, role === "admin" ? "coder" : "admin"))
          }
        >
          {role === "admin" ? "Make coder" : "Make admin"}
        </PillButton>
      )}
      {role === "coder" && isActive && (
        <PillButton
          disabled={pending}
          onClick={() => run(() => setChiefAction(userId, !isChiefCoder))}
        >
          {isChiefCoder ? "Remove chief" : "Make chief"}
        </PillButton>
      )}
      {!isSelf && (
        <PillButton
          variant={isActive ? "danger" : "default"}
          disabled={pending}
          onClick={() => run(() => setActiveAction(userId, !isActive))}
        >
          {isActive ? "Deactivate" : "Reactivate"}
        </PillButton>
      )}
      {!isSelf && (
        <PillButton
          variant="danger"
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
        >
          {confirmingDelete ? "Click again: delete forever" : "Delete"}
        </PillButton>
      )}
    </span>
  );
}
