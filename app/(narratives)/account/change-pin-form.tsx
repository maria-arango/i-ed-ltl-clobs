"use client";
import { useState, useTransition } from "react";
import { changePinAction } from "./actions";

const field =
  "mono mt-1 w-40 rounded-md border border-hairline bg-paper px-3 py-2.5 text-[18px] tracking-[0.3em] text-ink focus:border-hairline-strong";

export function ChangePinForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await changePinAction(current, next, repeat);
          setMsg({ ok: r.ok, text: r.ok ? "Your code has been changed." : (r.error ?? "Failed.") });
          if (r.ok) {
            setCurrent("");
            setNext("");
            setRepeat("");
          }
        });
      }}
    >
      {[
        ["current", "Current code", current, setCurrent],
        ["next", "New code", next, setNext],
        ["repeat", "New code again", repeat, setRepeat],
      ].map(([id, label, value, set]) => (
        <div key={id as string}>
          <label htmlFor={id as string} className="block text-[14px] font-medium text-ink">
            {label as string}
          </label>
          <input
            id={id as string}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={value as string}
            onChange={(e) => (set as (v: string) => void)(digits(e.target.value))}
            className={field}
          />
        </div>
      ))}
      <p className="text-[13px] text-smoke">Avoid repeated or consecutive digits (like 1111 or 1234). Never share your code.</p>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-[14px] ${msg.ok ? "text-forest" : "text-clay"}`}>
          {msg.text}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || current.length !== 4 || next.length !== 4 || repeat.length !== 4}
        className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ash"
      >
        Change code
      </button>
    </form>
  );
}
