/**
 * The coding workspace for one assigned video. Server component: reads
 * exclusively through the restricted coder layer. The video must be
 * STARTED first (Amendment §45: one video at a time); until then the page
 * shows "Do you want to start this video?" or "Finish V-xxxx first".
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth-helpers";
import { getRubricContent, getWorkspace } from "@/lib/db/coder";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { CopyButton } from "@/components/workspace/copy-button";
import { StartVideoCard } from "@/components/workspace/start-video-card";

export default async function VideoWorkspace({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const session = await requireSession();
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) notFound();

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
          {/* The video link card — the darker rectangle from the brief. */}
          <div className="elev-card card-lift flex flex-wrap items-center justify-between gap-4 rounded-lg border border-hairline-strong bg-sunken p-5">
            <div>
              <p className="video-code text-[20px] text-ink">{video.displayCode}</p>
              <p className="mt-1 text-[13px] text-smoke">
                Watch in Google Drive, take notes here as you go.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {video.driveUrl ? (
                <>
                  <a
                    href={video.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]"
                  >
                    Open video in Drive{" "}
                    <span
                      aria-hidden
                      className="inline-block transition-transform duration-[150ms] ease-out-clobs group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0"
                    >
                      ↗
                    </span>
                  </a>
                  <CopyButton text={video.driveUrl} />
                </>
              ) : (
                <p className="text-[14px] text-graphite">
                  Drive link not attached yet. An admin will add it.
                </p>
              )}
            </div>
          </div>

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
