/**
 * Server-side sanitizer for note HTML before it is shown to ANOTHER coder
 * in the calibration room. Notes are authored in our own Tiptap editor, so
 * the allowlist mirrors exactly what that editor can produce (see
 * components/workspace/notes-editor.tsx): paragraphs, two heading levels
 * with their inline size styles, bold/italic/strike/underline, multicolor
 * <mark> highlights, text alignment, and plain/numbered lists. Anything
 * else — scripts, event handlers, iframes, images, links — is stripped,
 * never escaped-and-kept.
 */
import sanitizeHtml from "sanitize-html";

export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "h2",
      "h3",
      "strong",
      "b",
      "em",
      "i",
      "s",
      "u",
      "mark",
      "ul",
      "ol",
      "li",
      "br",
    ],
    allowedAttributes: {
      p: ["style"],
      h2: ["style"],
      h3: ["style"],
      mark: ["style", "data-color"],
      li: ["style"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        "font-size": [/^\d{1,2}px$/],
        "line-height": [/^[\d.]+$/],
        "font-weight": [/^\d{3}$/],
        margin: [/^[\d.]+em 0(?: [\d.]+em)?$/],
        "background-color": [/^#[0-9a-fA-F]{6}$/],
      },
    },
    disallowedTagsMode: "discard",
  });
}
