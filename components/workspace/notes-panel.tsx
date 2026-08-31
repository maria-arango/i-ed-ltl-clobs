"use client";
/**
 * Free-form notes (Amendment B §15). Each entry is plain text; the video
 * minute is an OPTIONAL mm:ss field — nothing ever requires it. No motion
 * anywhere on this surface (DESIGN_SYSTEM §4 frequency gate).
 */
import { useState } from "react";
import { AutosaveIndicator } from "@/components/workspace/autosave-indicator";
import { useAutosave } from "@/lib/use-autosave";

export interface NoteData {
  id: string | null;
  body: string;
  videoTimestampSeconds: number | null;
}

function secondsToMmss(s: number | null): string {
  if (s == null) return "";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function mmssToSeconds(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const m = t.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function NoteEntry({
  videoId,
  note,
  onDeleted,
}: {
  videoId: string;
  note: NoteData & { key: string };
  onDeleted: () => void;
}) {
  const [body, setBody] = useState(note.body);
  const [tsText, setTsText] = useState(secondsToMmss(note.videoTimestampSeconds));
  const [noteId, setNoteId] = useState(note.id);
  const [gone, setGone] = useState(false);

  const { status, savedAt } = useAutosave({
    value: { body, tsText },
    storageKey: `note-${videoId}-${note.key}`,
    enabled: !gone && body.trim() !== "",
    save: async (v) => {
      const res = await fetch(`/api/coder/videos/${videoId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId: noteId ?? undefined,
          body: v.body,
          videoTimestampSeconds: mmssToSeconds(v.tsText),
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const saved = await res.json();
      if (!noteId) setNoteId(saved.id);
    },
  });

  const remove = async () => {
    setGone(true);
    onDeleted();
    if (noteId) {
      await fetch(`/api/coder/videos/${videoId}/notes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
      }).catch(() => undefined);
    }
  };

  if (gone) return null;

  return (
    <div className="rounded-lg border border-hairline bg-paper p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[12px] text-smoke">
          <span>Minute (optional)</span>
          <input
            value={tsText}
            onChange={(e) => setTsText(e.target.value)}
            placeholder="mm:ss"
            aria-label="Video minute this note refers to (optional)"
            className="mono w-20 rounded-sm border border-hairline bg-sunken px-2 py-1 text-[12px] text-ink placeholder:text-ash focus:border-hairline-strong"
          />
        </label>
        <div className="flex items-center gap-4">
          <AutosaveIndicator status={status} savedAt={savedAt} />
          <button
            type="button"
            onClick={remove}
            className="rounded-sm text-[12px] text-smoke underline-offset-2 hover:text-clay hover:underline"
          >
            Delete
          </button>
        </div>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={Math.max(2, Math.min(10, body.split("\n").length))}
        placeholder="Write what you see and hear — in your own words, at your own pace."
        aria-label="Note"
        className="w-full resize-y rounded-md border border-hairline bg-paper p-3 text-[17px] leading-[1.65] text-ink placeholder:text-ash focus:border-hairline-strong"
      />
    </div>
  );
}

export function NotesPanel({
  videoId,
  initialNotes,
}: {
  videoId: string;
  initialNotes: Array<{
    id: string;
    body: string;
    videoTimestampSeconds: number | null;
  }>;
}) {
  const [entries, setEntries] = useState<Array<NoteData & { key: string }>>(
    initialNotes.map((n) => ({ ...n, key: n.id })),
  );

  const addNote = () => {
    setEntries((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        id: null,
        body: "",
        videoTimestampSeconds: null,
      },
    ]);
  };

  return (
    <section aria-label="Notes" className="max-w-[68ch] space-y-3">
      {entries.length === 0 && (
        <p className="text-[15px] text-graphite">
          No notes yet. Notes are yours alone until calibration — write freely.
        </p>
      )}
      {entries.map((note) => (
        <NoteEntry
          key={note.key}
          videoId={videoId}
          note={note}
          onDeleted={() =>
            setEntries((prev) => prev.filter((e) => e.key !== note.key))
          }
        />
      ))}
      <button
        type="button"
        onClick={addNote}
        className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[15px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
      >
        New note
      </button>
    </section>
  );
}
