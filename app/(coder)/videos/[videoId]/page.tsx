/**
 * The coding workspace for one assigned video. Server component: reads
 * exclusively through the restricted coder layer, starts the observation
 * on first open, and hands client panels their initial state.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth-helpers";
import {
  ensureObservation,
  getRubricContent,
  getWorkspace,
} from "@/lib/db/coder";
import { WorkspaceTabs } from "@/components/workspace/tabs";
import { NotesPanel } from "@/components/workspace/notes-panel";
import { ScoringPanel } from "@/components/workspace/scoring-panel";
import { ContextCardForm } from "@/components/workspace/context-card-form";
import { CopyButton } from "@/components/workspace/copy-button";

export default async function VideoWorkspace({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const session = await requireSession();
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) notFound();

  let workspace = await getWorkspace(session.user.id, videoId);
  if (!workspace) notFound();

  // First visit starts the observation (and its event trail).
  if (!workspace.observation) {
    await ensureObservation(session.user.id, videoId);
    workspace = (await getWorkspace(session.user.id, videoId))!;
  }

  const rubric = await getRubricContent();
  if (!rubric) throw new Error("No rubric version is seeded.");

  const { video, contextCard, fillsContextCard } = workspace;
  const submitted = workspace.observation?.status === "submitted";
  const scoredCount = workspace.scores.length;

  const cardMode: "edit" | "locked" | "readonly" = fillsContextCard
    ? "edit"
    : contextCard.locked || !contextCard.card
      ? "locked"
      : "readonly";
  const cardStatus =
    contextCard.card?.status === "submitted"
      ? "submitted"
      : contextCard.card
        ? "draft"
        : "none";

  const cardBadge = fillsContextCard
    ? cardStatus === "submitted"
      ? "done"
      : "yours"
    : cardMode === "locked"
      ? "after scores"
      : "theirs";

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 bg-paper p-8">
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

      {/* The video link card — the darker rectangle from the brief. */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-hairline-strong bg-sunken p-5">
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
                className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]"
              >
                Open video in Drive ↗
              </a>
              <CopyButton text={video.driveUrl} />
            </>
          ) : (
            <p className="text-[14px] text-graphite">
              Drive link not attached yet — an admin will add it.
            </p>
          )}
        </div>
      </div>

      <WorkspaceTabs
        initialTab={fillsContextCard && cardStatus !== "submitted" ? "card" : "notes"}
        tabs={[
          { id: "card", label: "Context card", badge: cardBadge },
          { id: "notes", label: "Notes", badge: String(workspace.notes.length) },
          {
            id: "scores",
            label: "Scores",
            badge: submitted ? "locked" : `${scoredCount}/8`,
          },
        ]}
      >
        <ContextCardForm
          videoId={videoId}
          initialCard={contextCard.card}
          initialStatus={cardStatus}
          fieldHelp={rubric.fieldHelp}
          mode={cardMode}
        />
        <NotesPanel videoId={videoId} initialNotes={workspace.notes} />
        <ScoringPanel
          videoId={videoId}
          concepts={rubric.concepts as never}
          guidance={rubric.guidance}
          initialScores={workspace.scores}
          initialSubmitted={submitted}
          notes={workspace.notes}
        />
      </WorkspaceTabs>
    </main>
  );
}
