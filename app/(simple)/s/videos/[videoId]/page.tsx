/**
 * Simple interface — the video hub: start it, watch it (here or in Drive),
 * then three big tiles: context card, notes, scores. Same rules as the full
 * workspace (one video at a time, timed sections, own card required).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth-helpers";
import { getWorkspace } from "@/lib/db/coder";
import { StartVideoCard } from "@/components/workspace/start-video-card";
import { VideoTheatre } from "@/components/workspace/video-theatre";
import { VideoProblemButton } from "@/components/workspace/video-problem-button";

function Tile({
  href,
  title,
  status,
  hint,
  tone,
}: {
  href: string;
  title: string;
  status: string;
  hint: string;
  tone: "done" | "todo" | "open";
}) {
  const color =
    tone === "done" ? "var(--clobs-forest)" : tone === "open" ? "var(--clobs-lake)" : "var(--clobs-graphite)";
  return (
    <Link
      href={href}
      className="elev-card card-lift flex items-center justify-between gap-4 rounded-2xl border border-hairline bg-card p-5"
    >
      <div className="min-w-0">
        <p className="text-[19px] font-medium text-ink">{title}</p>
        <p className="mt-1 text-[14px] text-graphite">{hint}</p>
      </div>
      <span className="shrink-0 text-[14px] font-medium" style={{ color }}>
        {status} <span aria-hidden>→</span>
      </span>
    </Link>
  );
}

export default async function SimpleVideoHub({ params }: { params: Promise<{ videoId: string }> }) {
  const session = await requireSession();
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) notFound();
  const ws = await getWorkspace(session.user.id, videoId);
  if (!ws) notFound();

  const submitted = ws.observation?.status === "submitted";
  const started = submitted || ws.lock.holder === "this";
  const cardStatus = ws.contextCard.mine?.status;
  const hasNote = ws.notes.some((n) => n.body.replace(/<[^>]*>/g, "").trim().length > 0);
  const scored = ws.scores.length;

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/s" className="rounded-sm text-lake underline underline-offset-4">
          My videos
        </Link>
        <span aria-hidden> / </span>
        <span className="video-code text-graphite">{ws.video.displayCode}</span>
      </nav>

      {!started ? (
        <StartVideoCard
          videoId={videoId}
          displayCode={ws.video.displayCode}
          lockedElsewhere={ws.lock.holder === "other" ? ws.lock.lockedVideo : null}
        />
      ) : (
        <>
          <VideoTheatre displayCode={ws.video.displayCode} driveUrl={ws.video.driveUrl} compact />
          {!submitted && (
            <VideoProblemButton videoId={videoId} alreadyReported={ws.video.problemReported} afterHref="/s" />
          )}

          <div className="space-y-3">
            <Tile
              href={`/s/videos/${videoId}/card`}
              title="Context card"
              hint="Who is in the room, what the class looks like"
              status={cardStatus === "submitted" ? "Done ✓" : cardStatus === "draft" ? "Continue" : "Start"}
              tone={cardStatus === "submitted" ? "done" : cardStatus === "draft" ? "open" : "todo"}
            />
            <Tile
              href={`/s/videos/${videoId}/notes`}
              title="Notes"
              hint="Write while you watch; free form"
              status={hasNote ? "Written ✓" : "Open"}
              tone={hasNote ? "done" : "todo"}
            />
            <Tile
              href={`/s/videos/${videoId}/scores`}
              title="Scores and justifications"
              hint="Eight concepts, four options each"
              status={submitted ? "Locked ✓" : scored > 0 ? `${scored} of 8` : "Start"}
              tone={submitted ? "done" : scored > 0 ? "open" : "todo"}
            />
          </div>

          {submitted && session.user.datasetScope !== "training" && (
            <Link
              href={`/calibration/${videoId}`}
              className="elev-card card-lift flex items-center justify-between rounded-2xl border bg-card p-5"
              style={{ borderColor: "var(--clobs-forest)" }}
            >
              <span className="text-[17px] text-ink">Calibrate with your partner</span>
              <span aria-hidden className="text-[20px]" style={{ color: "var(--clobs-forest)" }}>→</span>
            </Link>
          )}
        </>
      )}
    </div>
  );
}
