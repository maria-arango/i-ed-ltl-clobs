/**
 * The coding workspace for one assigned video. Server component: reads
 * exclusively through the restricted coder layer. The video must be
 * STARTED first (Amendment §45: one video at a time); until then the page
 * shows "Do you want to start this video?" or "Finish V-xxxx first".
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-helpers";
import { resolvedModeFor } from "@/lib/serve-mode";
import { getRubricContent, getWorkspace } from "@/lib/db/coder";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { StartVideoCard } from "@/components/workspace/start-video-card";
import { VideoTheatre } from "@/components/workspace/video-theatre";

export default async function VideoWorkspace({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const session = await requireSession();
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) notFound();
  // Phones and tablets (or accounts set to Simple) get the simple hub.
  const served = await resolvedModeFor(session.user);
  if (served.autoRedirect && served.mode === "simple") redirect(`/s/videos/${videoId}`);

  const workspace = await getWorkspace(session.user.id, videoId);
  if (!workspace) notFound();

  const { video, contextCard, lock } = workspace;
  const submitted = workspace.observation?.status === "submitted";
  // A submitted observation no longer needs the lock; anything else does.
  const started = submitted || lock.holder === "this";

  const rubric = await getRubricContent();
  if (!rubric) throw new Error("No rubric version is seeded.");

  const cardStatus =
    contextCard.mine?.status === "submitted" ? "submitted" : contextCard.mine ? "draft" : "none";

  // ONE note per observation (Amendment B §16): the first row is the note.
  const note = workspace.notes[0] ?? null;

  return (
    <main className="mx-auto min-h-screen max-w-[1440px] space-y-6 bg-paper p-8">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <Link href="/videos" className="rounded-sm text-lake underline underline-offset-4">
          My videos
        </Link>
        <span aria-hidden> / </span>
        <span className="video-code text-graphite">{video.displayCode}</span>
      </nav>

      {!started ? (
        <StartVideoCard
          videoId={videoId}
          displayCode={video.displayCode}
          lockedElsewhere={lock.holder === "other" ? lock.lockedVideo : null}
        />
      ) : (
        <>
          {/* The video card: watch here (Drive embed) or open in Drive (§3b). */}
          <VideoTheatre displayCode={video.displayCode} driveUrl={video.driveUrl} />

          <WorkspaceShell
            videoId={videoId}
            initialNote={note ? { id: note.id, body: note.body } : null}
            initialScores={workspace.scores}
            initialSubmitted={submitted}
            initialCard={contextCard.mine}
            initialCardStatus={cardStatus}
            partnerCard={contextCard.partner}
            partnerLocked={contextCard.partnerLocked}
            sections={workspace.sections}
            concepts={rubric.concepts as never}
            guidance={rubric.guidance}
            fieldHelp={rubric.fieldHelp}
          />
        </>
      )}
    </main>
  );
}
