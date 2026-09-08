"use client";
/**
 * A timed section (Amendment §44): the card or the scores sit behind a
 * "Start" button; opening writes a sitting (start, device), a heartbeat
 * keeps it alive every 30 s, leaving ends it, and the section content shows
 * only while the sitting is open. If the previous sitting did not end with
 * a submission, the coder must say what happened before continuing
 * (Amendment §45). Once the section is submitted the gate disappears.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SectionState } from "@/lib/db/coder";

const HEARTBEAT_MS = 30_000;

const REASON_CHIPS = [
  "Network dropped",
  "Battery / power",
  "Interrupted, had to stop",
  "Other",
];

export function SectionGate({
  videoId,
  section,
  title,
  state,
  children,
}: {
  videoId: string;
  section: "context_card" | "scores";
  title: string;
  state: SectionState;
  children: React.ReactNode;
}) {
  const [sessionId, setSessionId] = useState<string | null>(state.open?.id ?? null);
  const [needsReason, setNeedsReason] = useState(state.needsResumeReason);
  const [reasonChip, setReasonChip] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(sessionId);
  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  const open = async () => {
    setPending(true);
    setError(null);
    const reason = needsReason ? [reasonChip, reasonText.trim()].filter(Boolean).join(": ") : null;
    try {
      const res = await fetch(`/api/coder/videos/${videoId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, viewportWidth: window.innerWidth, resumeReason: reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 428 && body.code === "resume_reason_required") {
        setNeedsReason(true);
        setError(null);
        return;
      }
      if (!res.ok) {
        setError(body.error ?? "Could not start.");
        return;
      }
      setSessionId(body.sessionId);
      setNeedsReason(false);
    } finally {
      setPending(false);
    }
  };

  const endSitting = useCallback(() => {
    const id = sessionRef.current;
    if (!id) return;
    // keepalive so the request survives the tab closing
    void fetch(`/api/coder/videos/${videoId}/sections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id, action: "end" }),
      keepalive: true,
    });
  }, [videoId]);

  // Heartbeat while open; end on leaving the page (not on tab switches:
  // panels stay mounted and the coder is still in the workspace).
  useEffect(() => {
    if (!sessionId || state.submitted) return;
    const beat = () =>
      void fetch(`/api/coder/videos/${videoId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "heartbeat" }),
      });
    const timer = setInterval(beat, HEARTBEAT_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") beat();
    };
    window.addEventListener("pagehide", endSitting);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", endSitting);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [sessionId, state.submitted, videoId, endSitting]);

  if (state.submitted || sessionId) return <>{children}</>;

  return (
    <section className="elev-card space-y-4 rounded-2xl border border-hairline bg-card p-6">
      <p className="font-serif text-[22px] leading-[1.3] text-ink">Start {title}</p>
      <p className="text-[15px] text-graphite">
        This section is timed from Start to Submit and meant for a single
        sitting. Your entries save as you type, so if the connection or the
        battery fails you continue exactly where you left off.
        {state.sittings > 0 && (
          <>
            {" "}
            You have sat down on it {state.sittings} time{state.sittings === 1 ? "" : "s"} before.
          </>
        )}
      </p>

      {needsReason && (
        <div className="space-y-3 rounded-xl border border-hairline-strong bg-paper p-4">
          <p className="text-[14px] text-ink">
            Your last sitting did not finish. What happened?
          </p>
          <div className="flex flex-wrap gap-2">
            {REASON_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setReasonChip(chip)}
                aria-pressed={reasonChip === chip}
                className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors duration-[90ms] ${
                  reasonChip === chip
                    ? "border-lake bg-lake-wash text-ink"
                    : "border-hairline-strong bg-paper text-graphite hover:bg-card"
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
          <input
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="A few words (optional unless 'Other')"
            className="w-full rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-ash"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || (needsReason && !reasonChip && reasonText.trim() === "") || (reasonChip === "Other" && reasonText.trim() === "")}
          onClick={() => void open()}
          className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
        >
          {pending ? "Starting…" : needsReason ? `Continue ${title}` : `Start ${title}`}
        </button>
        {error && (
          <p role="alert" className="text-[13px] text-clay">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
