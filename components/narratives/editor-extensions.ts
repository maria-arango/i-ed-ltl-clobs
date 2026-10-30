/**
 * Browser-only editor behaviour on top of the shared schema
 * (lib/narratives/editor-schema.ts): undo/redo, keyboard shortcuts, the
 * active-comment highlight, and comment-mark helpers. Comment marks are
 * added and removed with raw ProseMirror transactions so overlapping
 * comments are never merged or overwritten.
 */
import { Extension, type Editor } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNodeType } from "@tiptap/pm/model";
import { ReplaceStep, type Step } from "@tiptap/pm/transform";
import { narrativeSchemaExtensions } from "@/lib/narratives/editor-schema";
import { scriptLayout, segmentRoles } from "@/lib/narratives/script-layout";

export const activeCommentKey = new PluginKey<string | null>("activeComment");

const ActiveComment = Extension.create({
  name: "activeComment",
  addProseMirrorPlugins() {
    return [
      new Plugin<string | null>({
        key: activeCommentKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(activeCommentKey);
            return meta !== undefined ? (meta as string | null) : value;
          },
        },
        props: {
          decorations(state) {
            const id = activeCommentKey.getState(state);
            if (!id) return null;
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.isText && node.marks.some((m) => m.type.name === "comment" && m.attrs.commentId === id)) {
                decos.push(Decoration.inline(pos, pos + node.nodeSize, { class: "nx-comment-active" }));
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

/**
 * Review-script layout (Amendment §61): time and speaker in fixed columns,
 * scene lines bold, "seen" lines grey italic — drawn with decorations, so
 * the stored text stays exactly "time ⇥ who ⇥ text" (lib/narratives/script-layout.ts).
 */
function blockDecorations(block: PMNodeType, offset: number): Decoration[] {
  if (block.type.name !== "paragraph") return [];
  const layout = scriptLayout(block.textContent, block.attrs.variant as string | null);
  if (!layout) return [];
  const start = offset + 1;
  const decos = [
    Decoration.node(offset, offset + block.nodeSize, {
      class: `nx-script${layout.kind ? ` nx-${layout.kind}` : ""}`,
      style: `--nx-hang: ${layout.hang}`,
    }),
  ];
  for (const seg of segmentRoles(layout, 0, block.textContent.length)) {
    if (seg.role === "pre") decos.push(Decoration.inline(start + seg.from, start + seg.to, { class: "nx-pre" }));
    if (seg.role === "tab") {
      decos.push(Decoration.inline(start + seg.from, start + seg.to, { class: "nx-tab", style: `--nx-tab: ${seg.width}` }));
    }
  }
  return decos;
}

export function allDecorations(doc: PMNodeType): DecorationSet {
  const decos: Decoration[] = [];
  doc.forEach((block, offset) => decos.push(...blockDecorations(block, offset)));
  return DecorationSet.create(doc, decos);
}

/**
 * The layout after a transaction. Scripts run to 1,000+ lines, so only the
 * paragraphs the transaction touched are recomputed; the rest is mapped.
 */
export function updateScriptDecorations(tr: Transaction, old: DecorationSet): DecorationSet {
  if (!tr.docChanged) return old;
  let set = old.map(tr.mapping, tr.doc);
  // The stretch of paragraphs the change touched (plus their neighbours).
  let lo = Infinity;
  let hi = -Infinity;
  tr.mapping.maps.forEach((map, i) => {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const rest = tr.mapping.slice(i + 1);
      const from = rest.map(newStart, -1);
      const to = rest.map(newEnd, 1);
      tr.doc.nodesBetween(Math.max(0, from - 1), Math.min(tr.doc.content.size, to + 1), (node, pos) => {
        lo = Math.min(lo, pos);
        hi = Math.max(hi, pos + node.nodeSize);
        return false;
      });
    });
  });
  if (lo > hi) return set;
  // A mapped inline decoration can stretch across paragraphs pasted into
  // it, so everything inside the stretch is dropped and recomputed. find()
  // also returns decorations that only touch the stretch: keep those.
  set = set.remove(set.find(lo, hi).filter((d) => d.from >= lo && d.to <= hi));
  const fresh: Decoration[] = [];
  tr.doc.nodesBetween(lo, hi, (block, pos) => {
    if (pos >= lo && pos + block.nodeSize <= hi) fresh.push(...blockDecorations(block, pos));
    return false;
  });
  return set.add(tr.doc, fresh);
}

const scriptLayoutKey = new PluginKey<DecorationSet>("scriptLayout");

const ScriptLayout = Extension.create({
  name: "scriptLayout",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: scriptLayoutKey,
        state: {
          init: (_, state) => allDecorations(state.doc),
          apply: (tr, old) => updateScriptDecorations(tr, old),
        },
        props: {
          decorations: (state) => scriptLayoutKey.getState(state),
        },
      }),
    ];
  },
});

/** Event the editor DOM emits for Ctrl/Cmd+Alt+M; the workspace opens a comment. */
export const COMMENT_SHORTCUT_EVENT = "nx-comment-shortcut";

export function narrativeEditorExtensions() {
  const Shortcuts = Extension.create({
    name: "narrativeShortcuts",
    addKeyboardShortcuts() {
      return {
        "Mod-Shift-x": () => this.editor.commands.toggleStrike(),
        "Mod-Shift-r": () => toggleRed(this.editor),
        "Mod-Alt-m": () => {
          this.editor.view.dom.dispatchEvent(new CustomEvent(COMMENT_SHORTCUT_EVENT, { bubbles: true }));
          return true;
        },
        // In a script, Tab types the tab between time, speaker and text, as
        // in Word. Escape leaves the editor so Tab moves focus again.
        Tab: () => {
          const { $from } = this.editor.state.selection;
          const block = $from.parent;
          const inScript = block.type.name === "paragraph" && (scriptLayout(block.textContent, block.attrs.variant) || /^\d{1,3}:\d{2}/.test(block.textContent));
          if (!inScript || !this.editor.isEditable) return false;
          this.editor.view.dispatch(this.editor.state.tr.insertText("\t"));
          return true;
        },
        Escape: () => {
          this.editor.commands.blur();
          return true;
        },
      };
    },
  });
  return [...narrativeSchemaExtensions, UndoRedo, ActiveComment, ScriptLayout, Shortcuts];
}

export function isRedActive(editor: Editor): boolean {
  return editor.isActive("textColor", { color: "red" });
}

export function setRed(editor: Editor): boolean {
  return editor.chain().focus().setMark("textColor", { color: "red" }).run();
}

export function setBlack(editor: Editor): boolean {
  return editor.chain().focus().unsetMark("textColor").run();
}

export function toggleRed(editor: Editor): boolean {
  return isRedActive(editor) ? setBlack(editor) : setRed(editor);
}

/** Anchor a new comment on the current selection. */
export function addCommentMark(editor: Editor, commentId: string): boolean {
  const { from, to, empty } = editor.state.selection;
  if (empty) return false;
  const mark = editor.schema.marks.comment.create({ commentId });
  editor.view.dispatch(editor.state.tr.addMark(from, to, mark));
  return true;
}

/** Remove one comment's anchor everywhere (other comments untouched). */
export function removeCommentMark(editor: Editor, commentId: string) {
  const { state } = editor;
  let tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of node.marks) {
      if (m.type.name === "comment" && m.attrs.commentId === commentId) {
        tr = tr.removeMark(pos, pos + node.nodeSize, m);
      }
    }
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

export function setActiveComment(editor: Editor, id: string | null) {
  editor.view.dispatch(editor.state.tr.setMeta(activeCommentKey, id));
}

/** First document position of every comment anchor. */
export function commentAnchorPositions(doc: PMNodeType): Map<string, number> {
  const out = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of node.marks) {
      if (m.type.name === "comment" && !out.has(m.attrs.commentId)) out.set(m.attrs.commentId, pos);
    }
  });
  return out;
}

/** Comment ids at a document position (innermost last). */
export function commentsAt(doc: PMNodeType, pos: number): string[] {
  const $pos = doc.resolve(pos);
  const node = $pos.nodeAfter ?? $pos.nodeBefore;
  return (node?.marks ?? []).filter((m) => m.type.name === "comment").map((m) => m.attrs.commentId as string);
}

/** Characters of original (non-red) text a transaction removed. Only
 *  replace steps delete; mark steps (strike, red) never count. */
export function removedOriginalChars(steps: ReadonlyArray<Step>, docs: ReadonlyArray<PMNodeType>): number {
  let n = 0;
  steps.forEach((step, i) => {
    if (!(step instanceof ReplaceStep)) return;
    const { from, to } = step as unknown as { from: number; to: number };
    if (to <= from) return;
    docs[i].nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return;
      if (node.marks.some((m) => m.type.name === "textColor")) return;
      const start = Math.max(pos, from);
      const end = Math.min(pos + node.nodeSize, to);
      if (end > start) n += end - start;
    });
  });
  return n;
}
