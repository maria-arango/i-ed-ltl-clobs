/**
 * Layout of review-script lines (Amendment §61), shared by the editor, the
 * read-only view and the Word export so all three agree.
 *
 * A line is plain text "time ⇥ who ⇥ text", exactly as in the Word script
 * (review_script.py), so the team's review_import.py can read a downloaded
 * copy back. A fact is "label ⇥ text". On screen the time and the speaker
 * sit in fixed columns: the prefix is monospaced and each tab is widened to
 * reach the next column, counted in monospace characters.
 */

/** Column stops, in monospace characters from the start of the line. */
export const TIME_COL = 7;
export const BODY_COL = 21;
export const FACT_COL = 16;

/** The shape review_import.py reads: "m:ss" or "mm:ss", a tab, up to 24 characters, a tab. */
export const LINE_PATTERN = /^\d{1,3}:\d{2}\t[^\t]{1,24}\t/;
/** A minute marker: "05:00  ————". */
export const RULE_PATTERN = /^\s*\d{1,3}:\d{2}\s+—+\s*$/;

export type LineKind = "spoken" | "seen" | "scene";

export interface ScriptLayout {
  /** Monospaced prefix: characters [0, prefixEnd), tabs excepted. */
  prefixEnd: number;
  /** Each tab in the prefix and how many monospace characters wide to draw it. */
  tabs: Array<{ at: number; width: number }>;
  kind: LineKind | null;
  /** Hanging indent of wrapped lines, in monospace characters. */
  hang: number;
}

/** The speaker label of a line, e.g. "A1", "(seen)", "student?". */
export function lineWho(text: string): string | null {
  if (!LINE_PATTERN.test(text)) return null;
  const t1 = text.indexOf("\t");
  return text.slice(t1 + 1, text.indexOf("\t", t1 + 1)).trim();
}

/** Is this paragraph laid out as a script line? */
export function isScriptLine(text: string, variant: string | null | undefined): boolean {
  return variant === "line" || ((variant === null || variant === undefined) && LINE_PATTERN.test(text));
}

/** Width of any further tab in a laid-out paragraph (columns use their own). */
export const EXTRA_TAB = 2;

export function scriptLayout(text: string, variant: string | null | undefined): ScriptLayout | null {
  const layout = columnLayout(text, variant);
  if (!layout) return null;
  // Tabs past the columns (typed by hand) still show, as a small gap.
  const used = new Set(layout.tabs.map((t) => t.at));
  for (let i = text.indexOf("\t"); i >= 0; i = text.indexOf("\t", i + 1)) {
    if (!used.has(i)) layout.tabs.push({ at: i, width: EXTRA_TAB });
  }
  return layout;
}

function columnLayout(text: string, variant: string | null | undefined): ScriptLayout | null {
  if (isScriptLine(text, variant)) {
    const t1 = text.indexOf("\t");
    if (t1 < 0) return { prefixEnd: 0, tabs: [], kind: "spoken", hang: BODY_COL };
    const w1 = Math.max(1, TIME_COL - t1);
    const t2 = text.indexOf("\t", t1 + 1);
    if (t2 < 0) return { prefixEnd: t1, tabs: [{ at: t1, width: w1 }], kind: "spoken", hang: BODY_COL };
    const col = t1 + w1;
    const whoLen = t2 - t1 - 1;
    const w2 = Math.max(1, BODY_COL - col - whoLen);
    const who = text.slice(t1 + 1, t2).trim();
    const kind: LineKind = who === "(seen)" ? "seen" : who === "(scene)" ? "scene" : "spoken";
    return {
      prefixEnd: t2,
      tabs: [
        { at: t1, width: w1 },
        { at: t2, width: w2 },
      ],
      kind,
      hang: BODY_COL,
    };
  }
  if (variant === "fact") {
    const t1 = text.indexOf("\t");
    if (t1 < 0) return null;
    return { prefixEnd: t1, tabs: [{ at: t1, width: Math.max(1, FACT_COL - t1) }], kind: null, hang: FACT_COL };
  }
  return null;
}

export type SegmentRole = "pre" | "tab" | "body";

/**
 * Split a paragraph's character range [from, to) into the roles the layout
 * gives it. Used to cut text runs (which may carry marks) at the column
 * boundaries.
 */
export function segmentRoles(layout: ScriptLayout | null, from: number, to: number): Array<{ from: number; to: number; role: SegmentRole; width?: number }> {
  if (!layout) return [{ from, to, role: "body" }];
  const cuts = new Set<number>([from, to]);
  for (const t of layout.tabs) {
    if (t.at > from && t.at < to) cuts.add(t.at);
    if (t.at + 1 > from && t.at + 1 < to) cuts.add(t.at + 1);
  }
  if (layout.prefixEnd > from && layout.prefixEnd < to) cuts.add(layout.prefixEnd);
  const points = [...cuts].sort((a, b) => a - b);
  const out: Array<{ from: number; to: number; role: SegmentRole; width?: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const tab = layout.tabs.find((t) => t.at === a && b === a + 1);
    if (tab) out.push({ from: a, to: b, role: "tab", width: tab.width });
    else out.push({ from: a, to: b, role: a < layout.prefixEnd ? "pre" : "body" });
  }
  return out;
}
