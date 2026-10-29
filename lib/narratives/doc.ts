/**
 * Plain-data helpers for narrative documents (ProseMirror JSON), shared by
 * the importer, the server save path, the dashboard and the Word export.
 */

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

/** One comment's body; its anchor is the `comment` mark in the document. */
export interface NarrativeComment {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

/** Answers to the review template's questions (Amendment §51). */
export interface NarrativeAnswers {
  accuracy?: string;
  missing?: string;
  toneTeacher?: string;
  toneClass?: string;
}

export const ANSWER_KEYS = ["accuracy", "missing", "toneTeacher", "toneClass"] as const;

export function hasMark(node: PMNode, type: string): boolean {
  return !!node.marks?.some((m) => m.type === type);
}

export function isRed(node: PMNode): boolean {
  return !!node.marks?.some((m) => m.type === "textColor" && m.attrs?.color === "red");
}

/** Every text node, in document order. */
export function textNodes(doc: PMNode): PMNode[] {
  const out: PMNode[] = [];
  const walk = (n: PMNode) => {
    if (n.type === "text" && n.text) out.push(n);
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

export function plainText(doc: PMNode): string {
  return (doc.content ?? [])
    .map((block) => textNodes(block).map((t) => t.text).join(""))
    .join("\n");
}

/** Comment ids that still have an anchor in the document. */
export function anchoredCommentIds(doc: PMNode): Set<string> {
  const ids = new Set<string>();
  for (const t of textNodes(doc)) {
    for (const m of t.marks ?? []) {
      if (m.type === "comment" && typeof m.attrs?.commentId === "string") ids.add(m.attrs.commentId);
    }
  }
  return ids;
}

function words(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

export interface DocStats {
  totalChars: number;
  redChars: number;
  struckChars: number;
  comments: number;
  /** Words of the original AI text no longer present (struck counts as present). */
  originalWordsRemoved: number;
}

/**
 * Edit statistics for the dashboard and version history. "Original words
 * removed" compares the multiset of the original's words with the words of
 * all NON-red text now in the document: striking keeps a word, deleting
 * loses it (the template asks reviewers to strike, never delete).
 */
export function docStats(doc: PMNode, comments: NarrativeComment[], original?: PMNode): DocStats {
  let total = 0;
  let red = 0;
  let struck = 0;
  // Non-red text per block, with red runs simply left out: what remains is
  // the original text as it stands (struck or not), so an insertion inside
  // a word ("teac" + red "h" + "er") rejoins to the original "teacer".
  const nonRedBlocks: string[] = [];
  for (const block of doc.content ?? []) {
    let s = "";
    for (const t of textNodes(block)) {
      const len = t.text!.length;
      total += len;
      if (hasMark(t, "strike")) struck += len;
      if (isRed(t)) {
        red += len;
      } else {
        s += t.text!;
      }
    }
    nonRedBlocks.push(s);
  }
  let removed = 0;
  if (original) {
    const have = new Map<string, number>();
    for (const w of words(nonRedBlocks.join("\n"))) have.set(w, (have.get(w) ?? 0) + 1);
    const originalText = (original.content ?? [])
      .map((b) => textNodes(b).map((t) => t.text).join(""))
      .join("\n");
    for (const w of words(originalText)) {
      const n = have.get(w) ?? 0;
      if (n > 0) have.set(w, n - 1);
      else removed += 1;
    }
  }
  const anchored = anchoredCommentIds(doc);
  return {
    totalChars: total,
    redChars: red,
    struckChars: struck,
    comments: comments.filter((c) => anchored.has(c.id)).length,
    originalWordsRemoved: removed,
  };
}
