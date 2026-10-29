"use client";
/**
 * Comments in the right margin, next to the text they are attached to
 * (decision D6: our own layout, the approach of `sidenotes` without the
 * dependency). Each card sits at its anchor's height; when two collide the
 * lower one is pushed down, as in Google Docs. On narrow screens the same
 * cards are listed in document order inside a side panel instead.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { NarrativeComment } from "@/lib/narratives/doc";

export interface CommentView extends NarrativeComment {
  excerpt: string;
  /** Anchor height relative to the page, or null when the text is gone. */
  top: number | null;
  isDraft: boolean;
}

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

function CommentCard({
  c,
  active,
  canEdit,
  userId,
  onActivate,
  onSave,
  onCancelDraft,
  onDelete,
}: {
  c: CommentView;
  active: boolean;
  canEdit: boolean;
  userId: string;
  onActivate: (id: string) => void;
  onSave: (id: string, body: string) => void;
  onCancelDraft: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(c.isDraft);
  const [text, setText] = useState(c.body);
  const mine = c.authorId === userId || c.isDraft;
  const save = () => {
    const body = text.trim();
    if (!body) return;
    onSave(c.id, body);
    setEditing(false);
  };
  return (
    <div
      role="group"
      aria-label={`Comment by ${c.authorName || "you"}`}
      onClick={() => onActivate(c.id)}
      className={`elev-card rounded-xl border bg-paper p-3 text-[14px] ${
        active ? "border-bark" : "border-hairline"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-ink">{c.isDraft ? "New comment" : c.authorName}</span>
        {!c.isDraft && <span className="text-[12px] text-smoke">{fmt(c.updatedAt)}</span>}
      </div>
      {c.top === null && !c.isDraft && (
        <p className="mt-1 text-[12px] text-clay">The text this comment was on has been removed.</p>
      )}
      {editing && canEdit && mine ? (
        <div className="mt-2">
          <label className="sr-only" htmlFor={`comment-${c.id}`}>
            Comment text
          </label>
          <textarea
            id={`comment-${c.id}`}
            autoFocus
            value={text}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
              if (e.key === "Escape") {
                if (c.isDraft) onCancelDraft(c.id);
                else setEditing(false);
              }
            }}
            className="w-full resize-y rounded-md border border-hairline bg-paper px-2.5 py-2 text-[14px] text-ink focus:border-hairline-strong"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!text.trim()}
              className="rounded-md bg-bark px-3 py-1.5 text-[13px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ash"
            >
              {c.isDraft ? "Comment" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (c.isDraft) {
                  onCancelDraft(c.id);
                } else {
                  setText(c.body);
                  setEditing(false);
                }
              }}
              className="rounded-md border border-hairline-strong bg-paper px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 whitespace-pre-wrap text-ink">{c.body}</p>
          {canEdit && mine && (
            <div className="mt-2 flex gap-3 text-[13px]">
              <button type="button" onClick={() => setEditing(true)} className="rounded-sm text-lake underline underline-offset-4">
                Edit
              </button>
              <button type="button" onClick={() => onDelete(c.id)} className="rounded-sm text-clay underline underline-offset-4">
                Delete
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export interface CommentsProps {
  comments: CommentView[];
  activeId: string | null;
  canEdit: boolean;
  userId: string;
  onActivate: (id: string) => void;
  onSave: (id: string, body: string) => void;
  onCancelDraft: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Wide screens: cards positioned beside their anchors. */
export function CommentsMargin(props: CommentsProps) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const placed = [...props.comments]
    .filter((c) => c.top !== null)
    .sort((a, b) => a.top! - b.top!);
  const orphans = props.comments.filter((c) => c.top === null);

  // Second pass: push colliding cards down (needs measured heights).
  useLayoutEffect(() => {
    let bottom = -Infinity;
    for (const c of placed) {
      const el = refs.current.get(c.id);
      if (!el) continue;
      const top = Math.max(c.top!, bottom + 8);
      el.style.top = `${top}px`;
      bottom = top + el.offsetHeight;
    }
  });

  return (
    <div className="relative h-full">
      {placed.map((c) => (
        <div
          key={c.id}
          ref={(el) => {
            if (el) refs.current.set(c.id, el);
            else refs.current.delete(c.id);
          }}
          className="absolute left-0 right-0"
          style={{ top: c.top! }}
        >
          <CommentCard c={c} active={props.activeId === c.id} {...props} />
        </div>
      ))}
      {orphans.length > 0 && (
        <div className="sticky top-24 mt-4 space-y-2">
          {orphans.map((c) => (
            <CommentCard key={c.id} c={c} active={props.activeId === c.id} {...props} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Narrow screens: the same cards, listed in document order. */
export function CommentsList(props: CommentsProps) {
  const ordered = [...props.comments].sort((a, b) => (a.top ?? Infinity) - (b.top ?? Infinity));
  if (ordered.length === 0) {
    return <p className="text-[14px] text-graphite">No comments yet. Select text and choose Comment.</p>;
  }
  return (
    <ul className="space-y-2">
      {ordered.map((c) => (
        <li key={c.id}>
          <p className="mb-1 line-clamp-2 text-[12px] text-graphite">“{c.excerpt}”</p>
          <CommentCard c={c} active={props.activeId === c.id} {...props} />
        </li>
      ))}
    </ul>
  );
}
