"use client";
/**
 * Set a person's 4-digit sign-in code (the code the master team assigned,
 * Amendment §60) and lift a lock. The platform stores only a hash; nobody
 * can change their own code.
 */
import { useState, useTransition } from "react";
import { setPinAction, unlockPinAction } from "./actions";

export function PinButton({
  userId,
  hasPin,
  locked,
}: {
  userId: string;
  hasPin: boolean;
  locked: "temporary" | "hard" | null;
}) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(locked);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <span className="mr-1.5 inline-flex items-center gap-1.5">
        <label className="sr-only" htmlFor={`code-${userId}`}>
          4-digit code
        </label>
        <input
          id={`code-${userId}`}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={code}
          autoFocus
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="mono w-16 rounded-md border border-hairline bg-paper px-2 py-1 text-center text-[13px] text-ink focus:border-hairline-strong"
        />
        <button
          type="button"
          disabled={pending || code.length !== 4}
          onClick={() =>
            start(async () => {
              const r = await setPinAction(userId, code);
              if (r.ok) {
                setEditing(false);
                setCode("");
                setIsLocked(null);
                setMsg("Saved");
              } else setMsg(r.error ?? "Failed");
            })
          }
          className="rounded-full border border-hairline-strong bg-paper px-3 py-1 text-[12px] font-medium text-ink hover:bg-card disabled:cursor-not-allowed disabled:text-ash"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setCode("");
          }}
          className="rounded-sm text-[12px] text-lake underline underline-offset-4"
        >
          Cancel
        </button>
      </span>
    );
  }
  return (
    <span className="mr-1.5 inline-flex items-center gap-1.5">
      {msg && <span className="text-[12px] text-smoke">{msg}</span>}
      {isLocked && (
        <>
          <span className="text-[12px] font-medium text-clay">{isLocked === "hard" ? "Locked" : "Locked (temporary)"}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await unlockPinAction(userId);
                if (r.ok) {
                  setIsLocked(null);
                  setMsg("Unlocked");
                } else setMsg(r.error ?? "Failed");
              })
            }
            className="rounded-full border border-hairline-strong bg-paper px-3 py-1 text-[12px] font-medium text-ink hover:bg-card"
          >
            Unlock
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          setMsg(null);
          setEditing(true);
        }}
        className="inline-block rounded-full border border-hairline-strong bg-paper px-3 py-1 text-[12px] font-medium text-ink hover:bg-card"
      >
        {hasPin ? "Change code" : "Set code"}
      </button>
    </span>
  );
}
