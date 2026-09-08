"use client";
/**
 * Client shell for the video workspace: owns the tabs and keeps their
 * badges LIVE (scores count up as items are scored; the notes tab shows a
 * check once the note has content; the card badge follows its status).
 * The card and the scores sit behind timed-section gates (Amendment §44);
 * the partner's card appears read-only under my own once I have submitted.
 */
import { useState } from "react";
import { WorkspaceTabs } from "@/components/workspace/tabs";
import { NotesEditor } from "@/components/workspace/notes-editor";
import {
  ScoringPanel,
  type RubricConceptData,
  type RubricGuidanceRow,
} from "@/components/workspace/scoring-panel";
import { ContextCardForm, type CardData } from "@/components/workspace/context-card-form";
import { FloatingTiles } from "@/components/workspace/floating-tiles";
import { SectionGate } from "@/components/workspace/section-gate";
import type { SectionState } from "@/lib/db/coder";

export function WorkspaceShell({
  videoId,
  initialNote,
  initialScores,
  initialSubmitted,
  initialCard,
  initialCardStatus,
  partnerCard,
  partnerLocked,
  sections,
  concepts,
  guidance,
  fieldHelp,
}: {
  videoId: string;
  initialNote: { id: string; body: string } | null;
  initialScores: Array<{
    itemNo: number;
    scoreNum: number;
    justification: string | null;
  }>;
  initialSubmitted: boolean;
  initialCard: CardData | null;
  initialCardStatus: "none" | "draft" | "submitted";
  partnerCard: CardData | null;
  partnerLocked: boolean;
  sections: { context_card: SectionState; scores: SectionState };
  concepts: RubricConceptData[];
  guidance: RubricGuidanceRow[];
  fieldHelp: Record<string, string>;
}) {
  const [scoredCount, setScoredCount] = useState(initialScores.length);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [noteHtml, setNoteHtml] = useState(initialNote?.body ?? "");
  const [cardStatus, setCardStatus] = useState(initialCardStatus);
  const noteHasContent = noteHtml !== "" && noteHtml !== "<p></p>";

  const cardBadge = cardStatus === "submitted" ? "done ✓" : cardStatus === "draft" ? "draft" : "yours";

  return (
    <WorkspaceTabs
      initialTab={cardStatus !== "submitted" ? "card" : "notes"}
      tabs={[
        { id: "card", label: "Context card", badge: cardBadge },
        { id: "notes", label: "Notes", badge: noteHasContent ? "✓" : null },
        {
          id: "scores",
          label: "Scores",
          badge: submitted ? "locked ✓" : `${scoredCount}/8`,
        },
      ]}
    >
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-10">
          <SectionGate
            videoId={videoId}
            section="context_card"
            title="the context card"
            state={sections.context_card}
          >
            <ContextCardForm
              videoId={videoId}
              initialCard={initialCard}
              initialStatus={initialCardStatus}
              fieldHelp={fieldHelp}
              mode="edit"
              onStatusChange={setCardStatus}
            />
          </SectionGate>
          {(partnerLocked || partnerCard) && (
            <section aria-label="Your partner's context card" className="space-y-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-smoke">
                Your partner&apos;s card
              </h2>
              <ContextCardForm
                videoId={videoId}
                initialCard={partnerCard}
                initialStatus={partnerCard ? "submitted" : "none"}
                fieldHelp={fieldHelp}
                mode={partnerCard ? "readonly" : "locked"}
              />
            </section>
          )}
        </div>
        <FloatingTiles />
      </div>
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_280px]">
        <NotesEditor
          videoId={videoId}
          initialNote={initialNote}
          onContentChange={(_, html) => setNoteHtml(html)}
        />
        <FloatingTiles />
      </div>
      <SectionGate videoId={videoId} section="scores" title="scoring" state={sections.scores}>
        <ScoringPanel
          videoId={videoId}
          concepts={concepts}
          guidance={guidance}
          initialScores={initialScores}
          initialSubmitted={initialSubmitted}
          noteHtml={noteHtml}
          onProgress={(scored, isSubmitted) => {
            setScoredCount(scored);
            setSubmitted(isSubmitted);
          }}
        />
      </SectionGate>
    </WorkspaceTabs>
  );
}
