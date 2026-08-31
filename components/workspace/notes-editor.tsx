"use client";
/**
 * ONE rich-text note per observation (Amendment B §16), with a proper
 * Tiptap toolbar: undo/redo · text style (Heading/Subheading/Normal) ·
 * bold/italic/strike/underline · multicolor highlighter (5 markers) ·
 * alignment · bulleted/numbered lists. No tables and no dashed list
 * (María, 2026-08-31). The note HTML is SELF-CONTAINED: heading sizes
 * and highlight colors are inline styles, so rendering never depends on
 * a stylesheet — in the app, in exports, anywhere. No motion.
 *
 * Grounded in tiptap v3 (.reference/tiptap*): StarterKit already includes
 * bold/italic/strike/underline, undo-redo and the list extensions;
 * Highlight is configured multicolor.
 */
import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Heading } from "@tiptap/extension-heading";
import { mergeAttributes } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { AutosaveIndicator } from "@/components/workspace/autosave-indicator";
import { useAutosave } from "@/lib/use-autosave";

// Marker palette (DESIGN_SYSTEM §1 — content markers). Stored as hex so the
// exported HTML is self-contained.
const MARKERS = [
  { name: "Yellow", hex: "#F5E9B8" },
  { name: "Blue", hex: "#DCE6F1" },
  { name: "Green", hex: "#DEEADF" },
  { name: "Pink", hex: "#F4D9E7" },
  { name: "Purple", hex: "#E7DDF2" },
] as const;

// Headings carry their styling INLINE in the stored HTML (type scale:
// heading 26px, heading-sm 20px). Immune to stylesheet caching/build
// quirks, and exports render correctly with no CSS at all.
const HEADING_STYLE: Record<number, string> = {
  2: "font-size:26px;line-height:1.25;font-weight:600;margin:0.6em 0 0.4em",
  3: "font-size:20px;line-height:1.3;font-weight:600;margin:0.6em 0 0.4em",
};

const StyledHeading = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const level: number = this.options.levels.includes(node.attrs.level)
      ? node.attrs.level
      : this.options.levels[0];
    return [
      `h${level}`,
      mergeAttributes(HTMLAttributes, { style: HEADING_STYLE[level] ?? "" }),
      0,
    ];
  },
}).configure({ levels: [2, 3] });

function ToolButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-sm ${
        active
          ? "bg-lake-wash text-ink"
          : "text-graphite hover:bg-card disabled:cursor-not-allowed disabled:text-ash"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />;
}

export function NotesEditor({
  videoId,
  initialNote,
  onContentChange,
}: {
  videoId: string;
  initialNote: { id: string; body: string } | null;
  /** Fires with (hasContent, html) so the shell keeps badges and the
   *  scoring side pane live. */
  onContentChange?: (hasContent: boolean, html: string) => void;
}) {
  const [noteId, setNoteId] = useState(initialNote?.id ?? null);
  const [html, setHtml] = useState(initialNote?.body ?? "");
  const [markerOpen, setMarkerOpen] = useState(false);
  // Re-render the toolbar on every selection/content change so the active
  // states track the caret.
  const [, setTick] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false }),
      StyledHeading,
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({
        placeholder:
          "Write what you see and hear, in your own words, at your own pace.",
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
    onSelectionUpdate: () => setTick((t) => t + 1),
    onTransaction: () => setTick((t) => t + 1),
  });

  useEffect(() => {
    const close = () => setMarkerOpen(false);
    if (markerOpen) document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [markerOpen]);

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

  if (!editor) return null;

  const chain = () => editor.chain().focus();

  const textStyle = editor.isActive("heading", { level: 2 })
    ? "h2"
    : editor.isActive("heading", { level: 3 })
      ? "h3"
      : "p";

  return (
    <section aria-label="Notes" className="max-w-[80ch]">
      <div className="rounded-xl border border-hairline bg-paper">
        <div
          role="toolbar"
          aria-label="Text formatting"
          className="flex flex-wrap items-center gap-0.5 border-b border-hairline bg-card px-2 py-1.5"
        >
          <ToolButton
            title="Undo"
            disabled={!editor.can().undo()}
            onClick={() => chain().undo().run()}
          >
            <Undo2 size={16} />
          </ToolButton>
          <ToolButton
            title="Redo"
            disabled={!editor.can().redo()}
            onClick={() => chain().redo().run()}
          >
            <Redo2 size={16} />
          </ToolButton>

          <Divider />

          <label className="sr-only" htmlFor="note-text-style">
            Text style
          </label>
          <select
            id="note-text-style"
            value={textStyle}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "p") chain().setParagraph().run();
              if (v === "h2") chain().setHeading({ level: 2 }).run();
              if (v === "h3") chain().setHeading({ level: 3 }).run();
            }}
            className="h-8 rounded-sm border border-hairline bg-paper px-1.5 text-[13px] text-ink focus:border-hairline-strong"
          >
            <option value="h2">Heading</option>
            <option value="h3">Subheading</option>
            <option value="p">Normal</option>
          </select>

          <Divider />

          <ToolButton
            title="Bold"
            active={editor.isActive("bold")}
            onClick={() => chain().toggleBold().run()}
          >
            <Bold size={16} />
          </ToolButton>
          <ToolButton
            title="Italic"
            active={editor.isActive("italic")}
            onClick={() => chain().toggleItalic().run()}
          >
            <Italic size={16} />
          </ToolButton>
          <ToolButton
            title="Strikethrough"
            active={editor.isActive("strike")}
            onClick={() => chain().toggleStrike().run()}
          >
            <Strikethrough size={16} />
          </ToolButton>
          <ToolButton
            title="Underline"
            active={editor.isActive("underline")}
            onClick={() => chain().toggleUnderline().run()}
          >
            <Underline size={16} />
          </ToolButton>

          <span className="relative">
            <ToolButton
              title="Highlight color"
              active={editor.isActive("highlight")}
              onClick={() => setMarkerOpen((o) => !o)}
            >
              <Highlighter size={16} />
            </ToolButton>
            {markerOpen && (
              <span
                className="absolute left-0 top-9 z-10 flex items-center gap-1 rounded-md border border-hairline bg-paper p-1.5"
                style={{ boxShadow: "var(--clobs-shadow-float)" }}
                role="menu"
                aria-label="Highlight colors"
              >
                {MARKERS.map((m) => (
                  <button
                    key={m.hex}
                    type="button"
                    title={`Highlight ${m.name.toLowerCase()}`}
                    aria-label={`Highlight ${m.name.toLowerCase()}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      chain().setHighlight({ color: m.hex }).run();
                      setMarkerOpen(false);
                    }}
                    className="size-6 rounded-sm border border-hairline-strong"
                    style={{ background: m.hex }}
                  />
                ))}
                <button
                  type="button"
                  title="Remove highlight"
                  aria-label="Remove highlight"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    chain().unsetHighlight().run();
                    setMarkerOpen(false);
                  }}
                  className="flex size-6 items-center justify-center rounded-sm border border-hairline text-[11px] text-graphite hover:bg-card"
                >
                  ✕
                </button>
              </span>
            )}
          </span>

          <Divider />

          <ToolButton
            title="Align left"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => chain().setTextAlign("left").run()}
          >
            <AlignLeft size={16} />
          </ToolButton>
          <ToolButton
            title="Center"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => chain().setTextAlign("center").run()}
          >
            <AlignCenter size={16} />
          </ToolButton>
          <ToolButton
            title="Align right"
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => chain().setTextAlign("right").run()}
          >
            <AlignRight size={16} />
          </ToolButton>
          <ToolButton
            title="Justify"
            active={editor.isActive({ textAlign: "justify" })}
            onClick={() => chain().setTextAlign("justify").run()}
          >
            <AlignJustify size={16} />
          </ToolButton>

          <Divider />

          <ToolButton
            title="Bulleted list"
            active={editor.isActive("bulletList")}
            onClick={() => chain().toggleBulletList().run()}
          >
            <List size={16} />
          </ToolButton>
          <ToolButton
            title="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => chain().toggleOrderedList().run()}
          >
            <ListOrdered size={16} />
          </ToolButton>

          <span className="ml-auto pr-2">
            <AutosaveIndicator status={status} savedAt={savedAt} />
          </span>
        </div>
        <EditorContent editor={editor} />
      </div>
      <p className="mt-2 text-[12px] text-smoke">
        Your notes are yours alone until calibration. Write freely, in any
        form you like.
      </p>
    </section>
  );
}
