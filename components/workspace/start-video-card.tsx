"use client";
/**
 * "Do you want to start this video?" (Amendment §45). Starting takes the
 * coder's single lock: until this observation is submitted, no other video
 * can be worked. Nothing else on the page renders before this choice.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function StartVideoCard({
  videoId,
  displayCode,
  lockedElsewhere,
}: {
  videoId: string;
  displayCode: string;
  /** Another video already holds the lock. */
  lockedElsewhere: { videoId: string; displayCode: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (lockedElsewhere) {
    return (
      <section
        role="status"
        className="elev-card space-y-3 rounded-2xl border border-hairline bg-card p-6"
      >
        <p className="font-serif text-[22px] leading-[1.3] text-ink">
          Finish <span className="video-code">{lockedElsewhere.displayCode}</span> first
        </p>
        <p className="text-[15px] text-graphite">
          You started that video and one video is worked at a time, so it is
          completed in a single sitting. Submit it, then come back here.
        </p>
        <Link
          href={`/videos/${lockedElsewhere.videoId}`}
          className="inline-block rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]"
        >
          Go to {lockedElsewhere.displayCode}
        </Link>
      </section>
    );
  }

  return (
    <section className="elev-card space-y-4 rounded-2xl border border-hairline bg-card p-6">
      <p className="font-serif text-[22px] leading-[1.3] text-ink">
        Do you want to start <span className="video-code">{displayCode}</span>?
      </p>
      <p className="text-[15px] text-graphite">
        Starting a video means finishing it before moving to another one:
        your context card, your notes and your eight scores. Everything you
        type is saved as you go, so a lost connection never loses work.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await fetch(`/api/coder/videos/${videoId}/start`, { method: "POST" });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? "Could not start the video.");
                return;
              }
              router.refresh();
            })
          }
          className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
        >
          {pending ? "Starting…" : "Yes, start this video"}
        </button>
        <Link href="/videos" className="rounded-sm text-[14px] text-lake underline underline-offset-4">
          Not now
        </Link>
        {error && (
          <p role="alert" className="text-[13px] text-clay">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
