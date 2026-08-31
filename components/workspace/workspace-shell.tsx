"use client";
/**
 * Client shell for the video workspace: owns the tabs and keeps their
 * badges LIVE (scores count up as items are scored; the notes tab shows a
 * check once the note has content; the card badge follows its status).
 */
import { useState } from "react";
import { WorkspaceTabs } from "@/components/workspace/tabs";
import { NotesEditor } from "@/components/workspace/notes-editor";
import {
  ScoringPanel,
  type RubricConceptData,
  type RubricGuidanceRow,
} from "@/components/workspace/scoring-panel";
import {
  ContextCardForm,
  type CardData,
} from "@/components/workspace/context-card-form";

export function WorkspaceShell({
  videoId,
  fillsContextCard,
  initialNote,
  initialScores,
  initialSubmitted,
  initialCard,
  initialCardStatus,
  cardMode,
  concepts,
  guidance,
  fieldHelp,
}: {
  videoId: string;
  fillsContextCard: boolean;
  initialNote: { id: string; body: string } | null;
  initialScores: Array<{
    itemNo: number;
    scoreNum: number;
    justification: string | null;
  }>;
  initialSubmitted: boolean;
  initialCard: CardData | null;
  initialCardStatus: "none" | "draft" | "submitted";
  cardMode: "edit" | "locked" | "readonly";
  concepts: RubricConceptData[];
  guidance: RubricGuidanceRow[];
  fieldHelp: Record<string, string>;
}) {
  const [scoredCount, setScoredCount] = useState(initialScores.length);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [noteHtml, setNoteHtml] = useState(initialNote?.body ?? "");
  const [cardStatus, setCardStatus] = useState(initialCardStatus);
  const noteHasContent = noteHtml !== "" && noteHtml !== "<p></p>";

  const cardBadge = fillsContextCard
    ? cardStatus === "submitted"
      ? "done ✓"
      : "yours"
    : cardMode === "locked"
      ? "after scores"
      : "theirs";

  return (
    <WorkspaceTabs
      initialTab={
        fillsContextCard && cardStatus !== "submitted" ? "card" : "notes"
      }
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
      <ContextCardForm
        videoId={videoId}
        initialCard={initialCard}
        initialStatus={initialCardStatus}
        fieldHelp={fieldHelp}
        mode={cardMode}
        onStatusChange={setCardStatus}
      />
      <NotesEditor
        videoId={videoId}
        initialNote={initialNote}
        onContentChange={(_, html) => setNoteHtml(html)}
      />
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
    </WorkspaceTabs>
  );
}
