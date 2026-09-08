"use client";
/**
 * "Problem with this video" (Amendment §48): the escape from the one-video
 * lock when the video itself is the problem. A short reason goes to the
 * admins; the coder's lock is released so they can move on. Quiet by
 * default (a text link), a small card when opened.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const CHIPS = ["Link does not open", "Wrong video for this code", "No sound / unplayable", "Other"];

export function VideoProblemButton({
  videoId,
  alreadyReported,
  afterHref,
}: {
  videoId: string;
  alreadyReported: boolean;
  /** Where to go once reported (the list). */
  afterHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chip, setChip] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (alreadyReported) {
    return (
      <p role="status" className="text-[13px] text-graphite">
        You reported a problem with this video. Your admin has been notified; you can work on another video meanwhile.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-sm text-[13px] text-graphite underline-offset-2 hover:text-clay hover:underline"
      >
        Problem with this video?
      </button>
    );
  }

  const reason = [chip, text.trim()].filter(Boolean).join(": ");
  return (
    <div className="space-y-3 rounded-xl border border-hairline-strong bg-paper p-4">
      <p className="text-[15px] text-ink">What is wrong with the video?</p>
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChip(c)}
            aria-pressed={chip === c}
            className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors duration-[90ms] ${
              chip === c ? "border-lake bg-lake-wash text-ink" : "border-hairline-strong bg-paper text-graphite hover:bg-card"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="A few words (needed for 'Other')"
        className="w-full rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-ash"
      />
      <p className="text-[12px] text-smoke">
        Reporting frees you to work on another video. Your notes and scores here stay saved; an admin fixes the video and tells you.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !chip || (chip === "Other" && text.trim().length < 3)}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await fetch(`/api/coder/videos/${videoId}/problem`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? "Could not report.");
                return;
              }
              router.push(afterHref);
              router.refresh();
            })
          }
          className="rounded-md border border-clay bg-paper px-4 py-2 text-[14px] font-semibold text-clay transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:border-hairline disabled:text-ash"
        >
          {pending ? "Reporting…" : "Report and move on"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-sm text-[13px] text-graphite underline-offset-2 hover:underline">
          Cancel
        </button>
        {error && (
          <p role="alert" className="text-[13px] text-clay">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
