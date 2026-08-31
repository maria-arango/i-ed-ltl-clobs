"use client";
/**
 * ONE rich-text note per observation (Amendment B §16): a quiet writing
 * page with a small formatting bar — bold, highlight, text size,
 * alignment, bulleted / numbered / dashed lists. Content is stored as
 * HTML in the coder's single note row. No motion on this surface.
 */
import { useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import BulletList from "@tiptap/extension-bullet-list";
import { Placeholder } from "@tiptap/extensions";
import { AutosaveIndicator } from "@/components/workspace/autosave-indicator";
import { useAutosave } from "@/lib/use-autosave";

// Bullet list with a 'dash' variant so coders get dashed lists too.
const VariantBulletList = BulletList.extend({
  addAttributes() {
    return {
      variant: {
        default: "disc",
        parseHTML: (el) => el.getAttribute("data-variant") ?? "disc",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
    };
  },
});

function ToolbarButton({
  label,
  title,
  active,
  onClick,
}: {
  label: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      className={`min-w-8 rounded-sm px-2 py-1 text-[13px] ${
        active
          ? "bg-lake-wash font-semibold text-ink"
          : "text-graphite hover:bg-card"
      }`}
    >
      {label}
    </button>
  );
}

export function NotesEditor({
  videoId,
  initialNote,
  onContentChange,
}: {
  videoId: string;
  initialNote: { id: string; body: string } | null;
  /** Fires with (hasContent, html) so the shell can keep badges and the
   *  scoring side pane live. */
  onContentChange?: (hasContent: boolean, html: string) => void;
}) {
  const [noteId, setNoteId] = useState(initialNote?.id ?? null);
  const [html, setHtml] = useState(initialNote?.body ?? "");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ bulletList: false }),
      VariantBulletList,
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "justify"],
      }),
      Highlight,
      Placeholder.configure({
        placeholder:
          "Write what you see and hear — in your own words, at your own pace.",
      }),
    ],
    content: initialNote?.body ?? "",
    editorProps: {
      attributes: {
        class: "note-editor focus:outline-none",
        "aria-label": "Your notes for this video",
      },
    },
    onUpdate: ({ editor }) => {
      const next = editor.getHTML();
      setHtml(next);
      onContentChange?.(!editor.isEmpty, next);
    },
  });

  const { status, savedAt } = useAutosave({
    value: html,
    storageKey: `note-${videoId}`,
    enabled: html !== "" && html !== "<p></p>",
    save: async (body) => {
      const res = await fetch(`/api/coder/videos/${videoId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: noteId ?? undefined, body }),
      });
      if (!res.ok) throw new Error("save failed");
      const saved = await res.json();
      if (!noteId) setNoteId(saved.id);
    },
  });

  const dashActive = useMemo(
    () =>
      editor?.isActive("bulletList", { variant: "dash" }) ?? false,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, html],
  );

  if (!editor) return null;

  const toggleList = (variant: "disc" | "dash") => {
    const isBullet = editor.isActive("bulletList");
    const currentVariant = editor.getAttributes("bulletList").variant;
    if (isBullet && currentVariant === variant) {
      editor.chain().focus().toggleBulletList().run();
    } else if (isBullet) {
      editor.chain().focus().updateAttributes("bulletList", { variant }).run();
    } else {
      editor.chain().focus().toggleBulletList().updateAttributes("bulletList", { variant }).run();
    }
  };

  return (
    <section aria-label="Notes" className="max-w-[75ch]">
      <div className="rounded-xl border border-hairline bg-paper">
        <div
          role="toolbar"
          aria-label="Text formatting"
          className="flex flex-wrap items-center gap-1 border-b border-hairline bg-card px-2 py-1.5"
        >
          <ToolbarButton
            label={<strong>B</strong>}
            title="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            label={<span style={{ background: "var(--clobs-lake-wash)" }}>ab</span>}
            title="Highlight"
            active={editor.isActive("highlight")}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          />
          <ToolbarButton
            label="Aa+"
            title="Large text"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          />
          <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />
          <ToolbarButton
            label="⯇"
            title="Align left"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          />
          <ToolbarButton
            label="⯀"
            title="Center"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          />
          <ToolbarButton
            label="☰"
            title="Justify"
            active={editor.isActive({ textAlign: "justify" })}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          />
          <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />
          <ToolbarButton
            label="•"
            title="Bulleted list"
            active={editor.isActive("bulletList", { variant: "disc" })}
            onClick={() => toggleList("disc")}
          />
          <ToolbarButton
            label="–"
            title="Dashed list"
            active={dashActive}
            onClick={() => toggleList("dash")}
          />
          <ToolbarButton
            label="1."
            title="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <span className="ml-auto pr-2">
            <AutosaveIndicator status={status} savedAt={savedAt} />
          </span>
        </div>
        <EditorContent editor={editor} />
      </div>
      <p className="mt-2 text-[12px] text-smoke">
        Your notes are yours alone until calibration — write freely, in any
        form you like.
      </p>
    </section>
  );
}
