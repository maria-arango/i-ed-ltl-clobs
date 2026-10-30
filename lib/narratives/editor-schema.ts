/**
 * The narrative document schema, shared by the browser editor and the
 * server (which validates every save against it — ADR 0002). Built only
 * from the MIT Tiptap core plus three small marks of our own:
 *
 * - `textColor` { color: "red" } — reviewer additions and corrections.
 *   Stored as a NAME, not a hex value: the screen renders a darker red
 *   (WCAG AA), the Word export writes exactly FF0000 (STATUS §8.3).
 * - `evidence` — the pipeline's grey evidence codes ([W01-V0001], covers
 *   lines). Strikable like any text; never extended by typing next to it.
 * - `comment` { commentId } — a Word-style comment anchor. `excludes: ""`
 *   lets comment ranges overlap (the samples have up to two at once).
 *
 * Strikethrough is Tiptap's Strike, made non-inclusive (see below). No bold/italic/links/lists: the Word
 * template has none, and fewer marks means fewer surprises on export.
 */
import { getSchema, Mark, mergeAttributes } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import Strike from "@tiptap/extension-strike";
import Text from "@tiptap/extension-text";

/**
 * Paragraph kinds. NARRATIVE.md: `given`, `covers`. Review scripts
 * (lib/narratives/script.ts): `subtitle`, `note` (italic guidance), `fact`
 * ("label ⇥ text"), `rule` (a minute marker), `line` ("time ⇥ who ⇥ text")
 * and `flag` (the pipeline's grey "?" note under a line). A new paragraph
 * (Enter) is always plain; a plain paragraph typed as "time ⇥ who ⇥ text" is
 * laid out and exported as a line (lib/narratives/script-layout.ts).
 */
export type ParagraphVariant = "given" | "covers" | "subtitle" | "note" | "fact" | "rule" | "line" | "flag" | null;

export const NarrativeParagraph = Paragraph.extend({
  addAttributes() {
    return {
      variant: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute("data-variant"),
        renderHTML: (attrs) => (attrs.variant ? { "data-variant": attrs.variant } : {}),
      },
    };
  },
});

export const NarrativeHeading = Heading.configure({ levels: [1, 2, 3] });

// Strikethrough does NOT extend to text typed right after it: the review
// convention is "strike the wrong words, then type the correction next to
// them in red" (STATUS §8.4), so the correction must not come out struck.
export const NarrativeStrike = Strike.extend({ inclusive: false });

export const TextColor = Mark.create({
  name: "textColor",
  addAttributes() {
    return {
      color: {
        default: "red",
        parseHTML: (el) => el.getAttribute("data-color"),
        renderHTML: (attrs) => ({ "data-color": attrs.color }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-color]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "nx-red" }), 0];
  },
});

export const Evidence = Mark.create({
  name: "evidence",
  inclusive: false,
  parseHTML() {
    return [{ tag: "span[data-evidence]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-evidence": "", class: "nx-evidence" }), 0];
  },
});

export const CommentMark = Mark.create({
  name: "comment",
  excludes: "",
  inclusive: false,
  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment-id"),
        renderHTML: (attrs) => ({ "data-comment-id": attrs.commentId }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "nx-comment" }), 0];
  },
});

/** Schema-defining extensions (no UI behaviour), safe on the server. */
export const narrativeSchemaExtensions = [
  Document,
  NarrativeParagraph,
  Text,
  NarrativeHeading,
  NarrativeStrike,
  TextColor,
  Evidence,
  CommentMark,
];

export const narrativeSchema = getSchema(narrativeSchemaExtensions);

/** Refuse anything the editor could not have produced. */
export function validateNarrativeDoc(json: unknown): { ok: true } | { ok: false; error: string } {
  try {
    const node = narrativeSchema.nodeFromJSON(json);
    node.check();
    if (node.type.name !== "doc") return { ok: false, error: "not a document" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid document" };
  }
}
