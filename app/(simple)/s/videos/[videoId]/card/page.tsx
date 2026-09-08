import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-helpers";
import { getRubricContent, getWorkspace } from "@/lib/db/coder";
import { SectionGate } from "@/components/workspace/section-gate";
import { SimpleCardStepper } from "@/components/simple/card-stepper";
import { ContextCardForm } from "@/components/workspace/context-card-form";

export default async function SimpleCardPage({ params }: { params: Promise<{ videoId: string }> }) {
  const session = await requireSession();
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) notFound();
  const ws = await getWorkspace(session.user.id, videoId);
  if (!ws) notFound();
  if (ws.lock.holder !== "this" && ws.observation?.status !== "submitted") redirect(`/s/videos/${videoId}`);
  const rubric = await getRubricContent();
  if (!rubric) throw new Error("No rubric version is seeded.");
  const mine = ws.contextCard.mine;
  const status = mine?.status === "submitted" ? "submitted" : mine ? "draft" : "none";

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href={`/s/videos/${videoId}`} className="rounded-sm text-lake underline underline-offset-4">
          {ws.video.displayCode}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">Context card</span>
      </nav>
      <SectionGate videoId={videoId} section="context_card" title="the context card" state={ws.sections.context_card}>
        <SimpleCardStepper videoId={videoId} initialCard={mine} initialStatus={status} fieldHelp={rubric.fieldHelp} />
      </SectionGate>
      {(ws.contextCard.partnerLocked || ws.contextCard.partner) && (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-smoke">Your partner&apos;s card</h2>
          <ContextCardForm
            videoId={videoId}
            initialCard={ws.contextCard.partner}
            initialStatus={ws.contextCard.partner ? "submitted" : "none"}
            fieldHelp={rubric.fieldHelp}
            mode={ws.contextCard.partner ? "readonly" : "locked"}
          />
        </section>
      )}
    </div>
  );
}
