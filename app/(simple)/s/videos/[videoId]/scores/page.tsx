/**
 * Simple interface — scores. Reuses the scoring panel (one concept at a
 * time, collapsible rubric, four chips, justification, review table,
 * two-step lock) behind the timed-section gate; the panel's side rail
 * stacks above the concept on narrow screens.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-helpers";
import { getRubricContent, getWorkspace } from "@/lib/db/coder";
import { SectionGate } from "@/components/workspace/section-gate";
import { ScoringPanel } from "@/components/workspace/scoring-panel";

export default async function SimpleScoresPage({ params }: { params: Promise<{ videoId: string }> }) {
  const session = await requireSession();
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) notFound();
  const ws = await getWorkspace(session.user.id, videoId);
  if (!ws) notFound();
  const submitted = ws.observation?.status === "submitted";
  if (ws.lock.holder !== "this" && !submitted) redirect(`/s/videos/${videoId}`);
  const rubric = await getRubricContent();
  if (!rubric) throw new Error("No rubric version is seeded.");
  const note = ws.notes[0] ?? null;

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href={`/s/videos/${videoId}`} className="rounded-sm text-lake underline underline-offset-4">
          {ws.video.displayCode}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">Scores and justifications</span>
      </nav>
      <SectionGate videoId={videoId} section="scores" title="scoring" state={ws.sections.scores}>
        <ScoringPanel
          videoId={videoId}
          concepts={rubric.concepts as never}
          guidance={rubric.guidance}
          initialScores={ws.scores}
          initialSubmitted={submitted}
          noteHtml={note?.body ?? ""}
        />
      </SectionGate>
    </div>
  );
}
