/**
 * Reader for the review script Word files (Amendment §61) made by the
 * team's review_script.py (20261014_code/20261027_narrative_review):
 *
 *   Review script — <tr_id>                         bold 16 pt
 *   original (v17-v21) narrative · 677 lines · …    grey italic subtitle
 *   <instructions>                                  plain
 *   What the context card says                      bold (section head)
 *   <italic guidance>                               note
 *   Subject ⇥ Maths                                 fact (hanging indent)
 *   …
 *   The lesson                                      bold (section head)
 *   00:00  ——————                                   minute marker
 *   00:03 ⇥ A1 ⇥ Let's have a girl first.           line (hanging indent)
 *   ?  first heard as «…» — rewritten …             flag (grey, indented)
 *
 * Every paragraph's text is kept character for character, so a downloaded
 * copy compares cleanly with the original in review_import.py. Anything
 * this reader does not recognise is kept as a plain paragraph and reported.
 */
import JSZip from "jszip";
import type { PMNode } from "./doc";
import { LINE_PATTERN, RULE_PATTERN } from "./script-layout";

export const SCRIPT_PARSER_VERSION = "review-script-docx-v1";
export const SCRIPT_FORMAT = "review-script-docx";

export type ScriptBlockKind = "title" | "subtitle" | "plain" | "h2" | "h3" | "note" | "fact" | "rule" | "line" | "flag";

export interface ScriptBlock {
  kind: ScriptBlockKind;
  text: string;
}

export interface ParsedScript {
  lessonId: string | null;
  duration: string | null;
  blocks: ScriptBlock[];
  lineCount: number;
  warnings: string[];
}

/** One Word paragraph, reduced to what the classification needs. */
export interface RawParagraph {
  text: string;
  allBold: boolean;
  allItalic: boolean;
  grey: boolean;
  maxSize: number | null;
  indentLeft: number;
  hanging: number;
}

const TITLE = /^Review script\s*[—–-]\s*(\S+)\s*$/;

function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    return String.fromCodePoint(k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}

const on = (rpr: string, tag: string) => new RegExp(`<w:${tag}(?:\\s+w:val="(?:1|true|on)")?\\s*/>`).test(rpr);

/** The paragraphs of word/document.xml, in order (tracked deletions skipped). */
export function paragraphsFromDocumentXml(xml: string): RawParagraph[] {
  const body = xml.replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, "");
  const out: RawParagraph[] = [];
  for (const m of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const inner = m[1] ?? "";
    const ppr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(inner)?.[1] ?? "";
    const ind = /<w:ind\b([^>]*)\/?>/.exec(ppr)?.[1] ?? "";
    const indentLeft = Number(/w:(?:left|start)="(\d+)"/.exec(ind)?.[1] ?? 0);
    const hanging = Number(/w:hanging="(\d+)"/.exec(ind)?.[1] ?? 0);
    const runsXml = inner.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, "");
    let text = "";
    let allBold = true;
    let allItalic = true;
    let grey = false;
    let maxSize: number | null = null;
    let anyText = false;
    for (const r of runsXml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const rpr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(r[1])?.[1] ?? "";
      let t = "";
      for (const piece of r[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:t\b[^>]*\/>|<w:(tab|br|cr)\b[^>]*\/>/g)) {
        if (piece[2] === "tab") t += "\t";
        else if (piece[2]) t += " ";
        else t += unescapeXml(piece[1] ?? "");
      }
      if (!t) continue;
      text += t;
      if (t.trim()) {
        anyText = true;
        if (!on(rpr, "b")) allBold = false;
        if (!on(rpr, "i")) allItalic = false;
        const color = /<w:color w:val="([0-9A-Fa-f]{6})"/.exec(rpr)?.[1]?.toUpperCase();
        if (color === "808080") grey = true;
        const size = Number(/<w:sz w:val="(\d+)"/.exec(rpr)?.[1] ?? NaN);
        if (!Number.isNaN(size)) maxSize = Math.max(maxSize ?? 0, size);
      }
    }
    out.push({
      text,
      allBold: anyText && allBold,
      allItalic: anyText && allItalic,
      grey,
      maxSize,
      indentLeft,
      hanging,
    });
  }
  return out;
}

/** Name each paragraph by its shape (see the file comment). */
export function classifyScript(paras: RawParagraph[]): ParsedScript {
  const warnings: string[] = [];
  const blocks: ScriptBlock[] = [];
  let lessonId: string | null = null;
  let duration: string | null = null;
  let sawTitle = false;
  let sawSubtitle = false;
  let inLesson = false;
  let lineCount = 0;
  let unread = 0;

  for (const p of paras) {
    const text = p.text;
    if (!text.trim()) continue;
    if (!sawTitle) {
      const m = TITLE.exec(text.trim());
      if (m) {
        lessonId = m[1];
        sawTitle = true;
        blocks.push({ kind: "title", text });
        continue;
      }
    }
    if (sawTitle && !sawSubtitle && blocks.length === 1 && p.allItalic) {
      sawSubtitle = true;
      duration = /lesson runs (\d{1,3}:\d{2})/.exec(text)?.[1] ?? null;
      blocks.push({ kind: "subtitle", text });
      continue;
    }
    if (RULE_PATTERN.test(text)) {
      blocks.push({ kind: "rule", text });
      continue;
    }
    if (p.hanging > 0 && LINE_PATTERN.test(text)) {
      lineCount++;
      blocks.push({ kind: "line", text });
      continue;
    }
    if (p.indentLeft > 0 && p.hanging === 0 && text.trimStart().startsWith("?")) {
      blocks.push({ kind: "flag", text });
      continue;
    }
    if (p.hanging > 0 && /^[^\t]{1,40}\t/.test(text)) {
      blocks.push({ kind: "fact", text });
      continue;
    }
    if (p.allBold) {
      const kind = (p.maxSize ?? 0) >= 21 ? "h2" : "h3";
      if (text.trim() === "The lesson") inLesson = true;
      blocks.push({ kind, text });
      continue;
    }
    if (p.allItalic) {
      blocks.push({ kind: "note", text });
      continue;
    }
    if (inLesson) unread++;
    blocks.push({ kind: "plain", text });
  }

  if (!lessonId) warnings.push("No title of the form 'Review script — <lesson id>'.");
  if (!sawSubtitle) warnings.push("No subtitle line under the title.");
  if (!inLesson) warnings.push("No 'The lesson' section.");
  if (lineCount === 0) warnings.push("No lesson lines ('time ⇥ who ⇥ text').");
  if (unread) warnings.push(`${unread} paragraph(s) in the lesson are not in the 'time ⇥ who ⇥ text' shape; kept as plain text.`);
  return { lessonId, duration, blocks, lineCount, warnings };
}

export async function parseReviewScript(bytes: Uint8Array): Promise<ParsedScript> {
  let xml: string | undefined;
  try {
    const zip = await JSZip.loadAsync(bytes);
    xml = await zip.file("word/document.xml")?.async("string");
  } catch {
    xml = undefined;
  }
  if (!xml) {
    return { lessonId: null, duration: null, blocks: [], lineCount: 0, warnings: ["Not a Word (.docx) file."] };
  }
  return classifyScript(paragraphsFromDocumentXml(xml));
}

/** Plain text of the script (stored as the narrative's source text). */
export function scriptSourceText(p: ParsedScript): string {
  return p.blocks.map((b) => b.text).join("\n");
}

/** The editor document an enumerator starts from. */
export function scriptToDoc(p: ParsedScript): PMNode {
  const content: PMNode[] = p.blocks.map((b) => {
    const t = [{ type: "text", text: b.text }];
    switch (b.kind) {
      case "title":
        return { type: "heading", attrs: { level: 1 }, content: t };
      case "h2":
        return { type: "heading", attrs: { level: 2 }, content: t };
      case "h3":
        return { type: "heading", attrs: { level: 3 }, content: t };
      case "plain":
        return { type: "paragraph", attrs: { variant: null }, content: t };
      default:
        return { type: "paragraph", attrs: { variant: b.kind }, content: t };
    }
  });
  return { type: "doc", content };
}
