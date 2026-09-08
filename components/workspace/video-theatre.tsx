"use client";
/**
 * Watch here / watch in Drive (docs/08 §3b). The Drive embed
 * (https://drive.google.com/file/d/<id>/preview) plays only when the
 * browser is signed into a Google account with access and allows Google's
 * cookies inside our page — true on Chrome and Android, unreliable on
 * Safari (iPhone, iPad). So the embed is an ENHANCEMENT: "Open in Drive"
 * is always beside it, and the panel says what to do when the frame stays
 * blank. The choice is remembered per browser. Our page cannot read the
 * player's current time, so timestamps stay manual.
 */
import { useState, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/workspace/copy-button";

const PREF_KEY = "clobs.watchHere";

export function driveFileId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/d\/([A-Za-z0-9_-]{10,})/) ?? url.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function readPref(): boolean {
  try {
    return window.localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function VideoTheatre({
  displayCode,
  driveUrl,
  compact = false,
}: {
  displayCode: string;
  driveUrl: string | null;
  /** Phone/tablet layout: stacked, full-width buttons. */
  compact?: boolean;
}) {
  const watchHere = useSyncExternalStore(subscribe, readPref, () => false);
  const fileId = driveFileId(driveUrl);
  // Which file's player has finished loading (reset when the player is toggled).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = loadedFor === fileId;

  const setWatchHere = (on: boolean) => {
    setLoadedFor(null);
    try {
      window.localStorage.setItem(PREF_KEY, on ? "1" : "0");
    } catch {
      /* nothing to remember */
    }
    window.dispatchEvent(new Event("storage"));
  };

  const buttonBase =
    "rounded-md px-[18px] py-[10px] text-[15px] font-semibold transition-colors duration-[90ms] active:scale-[0.98]";
  const primary = `${buttonBase} bg-bark text-paper hover:bg-bark-deep`;
  const secondary = `${buttonBase} border border-hairline-strong bg-paper text-ink hover:bg-card`;

  return (
    <section
      aria-label="Video"
      className="elev-card space-y-4 rounded-lg border border-hairline-strong bg-sunken p-5"
    >
      <div className={`flex ${compact ? "flex-col" : "flex-wrap items-center justify-between"} gap-4`}>
        <div>
          <p className="video-code text-[20px] text-ink">{displayCode}</p>
          <p className="mt-1 text-[13px] text-smoke">
            {watchHere && fileId
              ? "Playing here. If the frame stays blank, open the video in Drive."
              : "Watch in Google Drive, or play it here; take notes as you go."}
          </p>
        </div>
        {driveUrl ? (
          <div className={`flex ${compact ? "flex-col" : "flex-wrap items-center"} gap-2`}>
            {fileId && (
              <button
                type="button"
                onClick={() => setWatchHere(!watchHere)}
                aria-pressed={watchHere}
                className={watchHere ? secondary : primary}
              >
                {watchHere ? "Hide the player" : "Watch here"}
              </button>
            )}
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`group ${watchHere && fileId ? secondary : fileId ? secondary : primary} text-center`}
            >
              Open in Drive{" "}
              <span
                aria-hidden
                className="inline-block transition-transform duration-[150ms] ease-out-clobs group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0"
              >
                ↗
              </span>
            </a>
            {!compact && <CopyButton text={driveUrl} />}
          </div>
        ) : (
          <p className="text-[14px] text-graphite">Drive link not attached yet. An admin will add it.</p>
        )}
      </div>

      {watchHere && fileId && (
        <div className="space-y-2">
          <div
            className="relative w-full overflow-hidden rounded-md bg-ink"
            style={{ aspectRatio: "16 / 9" }}
          >
            {!loaded && (
              <p className="absolute inset-0 flex items-center justify-center text-[13px] text-paper/70">
                Loading the Drive player…
              </p>
            )}
            <iframe
              title={`Video ${displayCode}`}
              src={`https://drive.google.com/file/d/${fileId}/preview`}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              onLoad={() => setLoadedFor(fileId)}
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
          <p className="text-[12px] text-smoke">
            Speed and full screen are in the player&apos;s own menu. If it shows
            &ldquo;You need access&rdquo; or nothing at all, your browser is
            blocking Google&apos;s sign-in inside this page (common on iPhone
            and iPad): use &ldquo;Open in Drive&rdquo;.
          </p>
        </div>
      )}
    </section>
  );
}
