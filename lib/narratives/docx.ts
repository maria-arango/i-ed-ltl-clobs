/**
 * Word (.docx) export of a reviewed narrative (Amendment §51, PLAN §4),
 * built with `docx` (MIT) to match the master team's review documents
 * (STATUS §8):
 *
 * - the review template on top (title, reviewer, length, instructions, the
 *   three questions with the enumerator's answers, time spent);
 * - the narrative: original text black 000000, reviewer additions red
 *   FF0000, struck text `w:strike` (keeping its colour), evidence codes
 *   grey 8C8C8C at 6.5 pt, given facts 10 pt indented, episode headers bold;
 * - real Word comments (comments.xml + commentRangeStart/End/Reference),
 *   with author and date; ranges may span paragraphs and overlap;
 * - NO tracked changes (the samples have none).
 */
import {
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  Document,
  Packer,
  Paragraph,
  TextRun,
  type ParagraphChild,
} from "docx";
import { hasMark, isRed, type NarrativeAnswers, type NarrativeComment, type PMNode } from "./doc";
import type { NarrativeTemplate } from "./template";

export const COLOR_ORIGINAL = "000000";
export const COLOR_RED = "FF0000";
export const COLOR_EVIDENCE = "8C8C8C";

export interface DocxInput {
  template: NarrativeTemplate | null;
  label: string;
  reviewerName: string;
  durationLabel: string | null;
  doc: PMNode;
  answers: NarrativeAnswers;
  comments: NarrativeComment[];
  activeMinutes: number;
  firstStart: Date | null;
  lastEnd: Date | null;
  submittedAt: Date | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 3)
    .join("");
}

const when = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "";

/** Text of a multi-line answer as paragraphs (one per line). */
function answerParagraphs(text: string | undefined): Paragraph[] {
  const lines = (text ?? "").split(/\r?\n/);
  if (!text?.trim()) return [new Paragraph({ children: [new TextRun({ text: "", color: COLOR_ORIGINAL })] })];
  return lines.map((l) => new Paragraph({ children: [new TextRun({ text: l, color: COLOR_ORIGINAL })] }));
}

function templateHeader(input: DocxInput): Paragraph[] {
  const t = input.template;
  const out: Paragraph[] = [];
  out.push(
    new Paragraph({
      children: [new TextRun({ text: `${t?.title ?? "Narrative review"}: ${input.label}`, bold: true, size: 32 })],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Reviewer: ${input.reviewerName}`, bold: true }),
        new TextRun({ text: `Lesson length according to the narrative: ${input.durationLabel ?? "unknown"}`, bold: true, break: 1 }),
      ],
    }),
  );
  if (!t) return out;
  out.push(
    new Paragraph({ children: [new TextRun({ text: t.checkNote, italics: true, color: COLOR_EVIDENCE, size: 20 })] }),
    new Paragraph({
      children: [
        new TextRun({ text: `${t.howToEditLabel} `, bold: true, size: 20 }),
        new TextRun({ text: t.howToEdit, size: 20 }),
      ],
    }),
  );
  const answers = input.answers as Record<string, string | undefined>;
  for (const q of t.questions) {
    out.push(new Paragraph({ children: [new TextRun({ text: q.title, bold: true, size: 26 })] }));
    out.push(new Paragraph({ children: [new TextRun({ text: q.prompt, italics: true, color: COLOR_EVIDENCE, size: 20 })] }));
    if (q.parts?.length) {
      for (const part of q.parts) {
        out.push(new Paragraph({ children: [new TextRun({ text: part.prompt, italics: true, color: COLOR_EVIDENCE, size: 20 })] }));
        out.push(...answerParagraphs(answers[part.key]));
      }
    } else {
      out.push(...answerParagraphs(answers[q.key]));
    }
  }
  const time = [
    `${input.activeMinutes} minutes (measured by the platform)`,
    input.firstStart ? `first opened ${when(input.firstStart)}` : "",
    input.lastEnd ? `last worked ${when(input.lastEnd)}` : "",
    input.submittedAt ? `submitted ${when(input.submittedAt)}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  out.push(
    new Paragraph({
      children: [new TextRun({ text: `${t.timeLabel} `, bold: true }), new TextRun({ text: time })],
    }),
    new Paragraph({ children: [new TextRun({ text: t.narrativeLabel, bold: true, color: COLOR_EVIDENCE, size: 18 })] }),
  );
  return out;
}

interface Run {
  node: PMNode;
  block: PMNode;
}

export async function narrativeToDocx(input: DocxInput): Promise<Buffer> {
  // Flatten the narrative into runs, remembering their block.
  const runs: Run[] = [];
  for (const block of input.doc.content ?? []) {
    for (const node of block.content ?? []) if (node.type === "text" && node.text) runs.push({ node, block });
  }

  // Word comment ids: anchored comments in document order, then detached ones.
  const commentIds = new Map<string, number>();
  const first = new Map<string, number>();
  const last = new Map<string, number>();
  runs.forEach((r, i) => {
    for (const m of r.node.marks ?? []) {
      if (m.type !== "comment") continue;
      const cid = String(m.attrs?.commentId);
      if (!first.has(cid)) first.set(cid, i);
      last.set(cid, i);
    }
  });
  const known = new Map(input.comments.map((c) => [c.id, c]));
  for (const cid of first.keys()) if (known.has(cid)) commentIds.set(cid, commentIds.size);
  const detached = input.comments.filter((c) => !first.has(c.id));
  for (const c of detached) commentIds.set(c.id, commentIds.size);

  const startsAt = new Map<number, number[]>();
  const endsAt = new Map<number, number[]>();
  for (const [cid, i] of first) {
    const n = commentIds.get(cid);
    if (n === undefined) continue;
    (startsAt.get(i) ?? startsAt.set(i, []).get(i)!).push(n);
    const j = last.get(cid)!;
    (endsAt.get(j) ?? endsAt.set(j, []).get(j)!).push(n);
  }

  const children: Paragraph[] = templateHeader(input);

  // Detached comments (their text was removed) anchor on the label line.
  if (detached.length && children.length) {
    const ids = detached.map((c) => commentIds.get(c.id)!);
    children.push(
      new Paragraph({
        children: [
          ...ids.map((n) => new CommentRangeStart(n)),
          new TextRun({ text: "Comments whose text was removed", color: COLOR_EVIDENCE, size: 16 }),
          ...ids.flatMap((n) => [new CommentRangeEnd(n), new TextRun({ children: [new CommentReference(n)] })]),
        ],
      }),
    );
  }

  let runIndex = 0;
  for (const block of input.doc.content ?? []) {
    const isHeading = block.type === "heading";
    const level = Number(block.attrs?.level ?? 0);
    const variant = block.attrs?.variant as string | null | undefined;
    const parts: ParagraphChild[] = [];
    for (const node of block.content ?? []) {
      if (node.type !== "text" || !node.text) continue;
      const i = runIndex++;
      for (const n of startsAt.get(i) ?? []) parts.push(new CommentRangeStart(n));
      const evidence = hasMark(node, "evidence");
      parts.push(
        new TextRun({
          text: node.text,
          color: isRed(node) ? COLOR_RED : evidence ? COLOR_EVIDENCE : COLOR_ORIGINAL,
          strike: hasMark(node, "strike") || undefined,
          bold: isHeading || undefined,
          size: evidence ? 13 : isHeading && level === 1 ? 28 : variant === "given" ? 20 : undefined,
        }),
      );
      for (const n of endsAt.get(i) ?? []) {
        parts.push(new CommentRangeEnd(n), new TextRun({ children: [new CommentReference(n)] }));
      }
    }
    children.push(
      new Paragraph({
        children: parts,
        indent: variant === "given" ? { left: 340 } : undefined,
      }),
    );
  }

  const document = new Document({
    creator: "LTL Classroom Observations platform",
    title: `Narrative review: ${input.label}`,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
          paragraph: { spacing: { after: 200, line: 276 } },
        },
      },
    },
    comments: {
      children: [...commentIds.entries()].map(([cid, n]) => {
        const c = known.get(cid)!;
        const d = new Date(c.updatedAt || c.createdAt);
        return {
          id: n,
          author: c.authorName,
          initials: initials(c.authorName),
          date: Number.isNaN(d.getTime()) ? undefined : d,
          children: c.body.split(/\r?\n/).map((line) => new Paragraph({ children: [new TextRun(line)] })),
        };
      }),
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1134, right: 1247, bottom: 1134, left: 1247 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}

/** "01_<lesson>_NARRATIVE_review_<FirstName>.docx", as the team names them. */
export function docxFilename(orderNo: number, label: string, reviewerName: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const first = safe(reviewerName.split(/\s+/)[0] ?? "reviewer") || "reviewer";
  return `${String(orderNo).padStart(2, "0")}_${safe(label)}_NARRATIVE_review_${first}.docx`;
}
