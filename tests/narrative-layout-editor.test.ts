/**
 * The editor's script layout stays right while editing (Amendment §61).
 *
 * Scripts run to 1,000+ lines, so the editor recomputes the column layout
 * only for the paragraphs a change touched. 2,400 random edits (40 seeds) —
 * typing, tabs, Enter, deletions across lines, pasted lines — must always
 * leave the same layout as recomputing the whole document.
 */
import { describe, expect, it } from "vitest";
import { EditorState } from "@tiptap/pm/state";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { DecorationSet } from "@tiptap/pm/view";
import { allDecorations, updateScriptDecorations } from "@/components/narratives/editor-extensions";
import { narrativeSchema } from "@/lib/narratives/editor-schema";

const para = (text: string, variant: string | null = null) => ({ type: "paragraph", attrs: { variant }, content: [{ type: "text", text }] });

const DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Review script — 99991_5" }] },
    para("original narrative  ·  6 lines", "subtitle"),
    para("Subject\tBiology", "fact"),
    para("A1\tteacher, green shirt", "fact"),
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "The lesson" }] },
    para("00:00  ————", "rule"),
    para("00:00\t(scene)\tThe teacher greets the class.", "line"),
    para("00:02\t(seen)\tA1 stands by the board.", "line"),
    para("00:05\tA1\tGood morning, class.", "line"),
    para("?  first heard as «Good morning»", "flag"),
    para("00:09\tall together\tGood morning, teacher.", "line"),
    para("Some plain words."),
    para("00:12\tstudent?\tMe!", "line"),
  ],
};

/** A comparable picture of a decoration set. */
function picture(set: DecorationSet): string[] {
  return set
    .find()
    .map((d) => `${d.from}-${d.to}-${JSON.stringify((d as unknown as { type: { attrs: unknown } }).type.attrs)}`)
    .sort();
}

/** A small seeded random generator, so a failure can be replayed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const PIECES = ["x", "\t", " [smiling]", "05:1", "0", "S1", "\t\t", "(seen)", "a b c"];

describe("incremental script layout", () => {
  it("matches a full recomputation after every random edit", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = rng(seed);
      let state = EditorState.create({ doc: narrativeSchema.nodeFromJSON(DOC) });
      let set = allDecorations(state.doc);
      for (let step = 0; step < 60; step++) {
        const size = state.doc.content.size;
        const pos = 1 + Math.floor(rand() * (size - 1));
        const $pos = state.doc.resolve(pos);
        const tr = state.tr;
        const kind = Math.floor(rand() * 5);
        if (kind === 0 && $pos.parent.isTextblock) {
          tr.insertText(PIECES[Math.floor(rand() * PIECES.length)], pos);
        } else if (kind === 1 && $pos.parent.isTextblock && $pos.depth === 1) {
          tr.split(pos);
        } else if (kind === 2) {
          const end = Math.min(size - 1, pos + 1 + Math.floor(rand() * 40));
          tr.delete(pos, end);
        } else if (kind === 3 && $pos.parent.isTextblock) {
          const lines = Fragment.from([
            narrativeSchema.nodeFromJSON(para("07:07\tS2\tpasted line", null)),
            narrativeSchema.nodeFromJSON(para("plain pasted", null)),
          ]);
          tr.replace(pos, pos, new Slice(lines, 1, 1));
        } else if ($pos.parent.isTextblock && $pos.parentOffset > 0) {
          tr.delete(pos - 1, pos); // backspace, sometimes across a tab or a line start
        }
        if (!tr.docChanged) continue;
        set = updateScriptDecorations(tr, set);
        state = state.apply(tr);
        expect(picture(set), `seed ${seed}, step ${step}`).toEqual(picture(allDecorations(state.doc)));
      }
    }
  });
});
