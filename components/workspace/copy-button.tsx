"use client";
/** Copy-link button with copy-state feedback (icon/word swap at 150ms). */
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="rounded-md border border-hairline-strong bg-paper px-4 py-2 text-[14px] font-semibold text-ink transition-colors duration-[150ms] hover:bg-card active:scale-[0.98]"
    >
      {copied ? "Copied ✓" : "Copy link"}
    </button>
  );
}
