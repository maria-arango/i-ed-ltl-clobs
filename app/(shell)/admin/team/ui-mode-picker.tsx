"use client";
/**
 * Which interface a coder gets (Amendment §46): Auto (by device), Simple
 * (ODK-style, even on a computer), Full (the workspace with tabs).
 */
import { useState, useTransition } from "react";
import { setUiModeAction } from "./actions";

const OPTIONS: Array<{ value: "auto" | "simple" | "full"; label: string; title: string }> = [
  { value: "auto", label: "Auto", title: "Simple on phones and tablets, full on computers" },
  { value: "simple", label: "Simple", title: "The ODK-style interface everywhere" },
  { value: "full", label: "Full", title: "The workspace with tabs everywhere" },
];

export function UiModePicker({ userId, value }: { userId: string; value: "auto" | "simple" | "full" }) {
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  return (
    <span role="group" aria-label="Interface" className="inline-flex rounded-full border border-hairline-strong bg-paper p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          disabled={pending}
          aria-pressed={current === o.value}
          onClick={() =>
            start(async () => {
              const r = await setUiModeAction(userId, o.value);
              if (r.ok) setCurrent(o.value);
            })
          }
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-[90ms] ${
            current === o.value ? "bg-lake-wash text-ink" : "text-graphite hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
