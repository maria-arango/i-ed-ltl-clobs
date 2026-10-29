/**
 * WORD EXPORT CONTRACT — PLAN §4, matched against the conventions found in
 * the master team's reviewed documents (STATUS §8): red additions FF0000,
 * manual strikethrough (w:strike) on any colour, grey 6.5 pt evidence codes,
 * real Word comments anchored on ranges (spanning paragraphs, overlapping),
 * author + date on each comment, and no tracked changes.
 */
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { narrativeToDocx, docxFilename, COLOR_RED, COLOR_EVIDENCE } from "@/lib/narratives/docx";
import { narrativeToDoc, parseNarrative } from "@/lib/narratives/parse";
import type { NarrativeComment, PMNode } from "@/lib/narratives/doc";
import template from "@/db/seed/narrative-template-2026-10-21.json";
import type { NarrativeTemplate } from "@/lib/narratives/template";

const SAMPLE = readFileSync("db/seed/narratives/placeholder-99903_12.md", "utf8");

function reviewedDoc(): { doc: PMNode; comments: NarrativeComment[] } {
  const doc = narrativeToDoc(parseNarrative(SAMPLE));
  // Episode paragraphs: plain paragraphs that carry evidence codes.
  const bodies = doc.content!.filter(
    (b) => b.type === "paragraph" && b.attrs?.variant === null && b.content?.some((t) => t.marks?.some((m) => m.type === "evidence")),
  );
  const p1 = bodies[0];
  const p2 = bodies[1];
  // Strike the first sentence of p1, add a red correction after it.
  const first = p1.content![0];
  first.marks = [{ type: "strike" }, { type: "comment", attrs: { commentId: "c-span" } }];
  p1.content!.splice(1, 0, { type: "text", text: " The teacher writes on the board.", marks: [{ type: "textColor", attrs: { color: "red" } }, { type: "comment", attrs: { commentId: "c-span" } }] });
  // Strike an evidence code too (seen in the samples).
  const ev = p1.content!.find((t) => t.marks?.some((m) => m.type === "evidence"))!;
  ev.marks = [...(ev.marks ?? []), { type: "strike" }];
  // c-span continues into p2 (multi-paragraph); c-inner overlaps it in p2.
  p2.content![0].marks = [{ type: "comment", attrs: { commentId: "c-span" } }, { type: "comment", attrs: { commentId: "c-inner" } }];
  // Red + strike (a reviewer striking their own addition).
  p2.content!.push({ type: "text", text: " wrong addition", marks: [{ type: "textColor", attrs: { color: "red" } }, { type: "strike" }] });
  const at = "2026-10-27T10:00:00.000Z";
  const comments: NarrativeComment[] = [
    { id: "c-span", body: "I did not hear this.\nThe teacher is at the back.", authorId: "u1", authorName: "Test Reviewer", createdAt: at, updatedAt: at },
    { id: "c-inner", body: "Voice from the next classroom", authorId: "u1", authorName: "Test Reviewer", createdAt: at, updatedAt: at },
    { id: "c-gone", body: "Comment on text that was later removed", authorId: "u1", authorName: "Test Reviewer", createdAt: at, updatedAt: at },
  ];
  return { doc, comments };
}

async function build() {
  const { doc, comments } = reviewedDoc();
  const buf = await narrativeToDocx({
    template: template as unknown as NarrativeTemplate,
    label: "N-0003",
    reviewerName: "Test Reviewer",
    durationLabel: "17:37",
    doc,
    answers: { accuracy: "Mostly accurate.\nTwo misattributed speakers.", missing: "Tone of voice", toneTeacher: "Warm", toneClass: "Lively" },
    comments,
    activeMinutes: 95,
    firstStart: new Date("2026-10-27T08:00:00Z"),
    lastEnd: new Date("2026-10-27T10:30:00Z"),
    submittedAt: new Date("2026-10-27T10:31:00Z"),
  });
  const zip = await JSZip.loadAsync(buf);
  const read = async (name: string) => (await zip.file(name)?.async("string")) ?? null;
  return { buf, zip, document: (await read("word/document.xml"))!, commentsXml: await read("word/comments.xml"), settings: await read("word/settings.xml") };
}

const ids = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<w:${tag} w:id="(\\d+)"`, "g"))].map((m) => m[1]);

describe("narrativeToDocx", () => {
  it("writes real Word comments with author, date and body", async () => {
    const { commentsXml } = await build();
    expect(commentsXml).not.toBeNull();
    const comments = [...commentsXml!.matchAll(/<w:comment\b[^>]*>/g)].map((m) => m[0]);
    expect(comments).toHaveLength(3);
    for (const c of comments) {
      expect(c).toContain('w:author="Test Reviewer"');
      expect(c).toMatch(/w:date="2026-10-27T10:00:00/);
      expect(c).toContain('w:initials="TR"');
    }
    expect(commentsXml).toContain("I did not hear this.");
    expect(commentsXml).toContain("The teacher is at the back.");
  });

  it("anchors every comment on a range: start, end and reference with matching ids", async () => {
    const { document } = await build();
    const starts = ids(document, "commentRangeStart");
    const ends = ids(document, "commentRangeEnd");
    const refs = ids(document, "commentReference");
    expect(new Set(starts)).toEqual(new Set(["0", "1", "2"]));
    expect(new Set(ends)).toEqual(new Set(starts));
    expect(new Set(refs)).toEqual(new Set(starts));
    for (const id of starts) {
      expect(document.indexOf(`<w:commentRangeStart w:id="${id}"`)).toBeLessThan(document.indexOf(`<w:commentRangeEnd w:id="${id}"`));
    }
  });

  it("keeps a comment that spans paragraphs and one that overlaps it", async () => {
    const { document } = await build();
    const span = /<w:commentRangeStart w:id="0"\/>[\s\S]*?<w:commentRangeEnd w:id="0"\/>/.exec(document)![0];
    expect((span.match(/<\/w:p>/g) ?? []).length).toBeGreaterThan(0); // crosses a paragraph boundary
    expect(span).toContain('<w:commentRangeStart w:id="1"/>'); // the overlapping comment opens inside it
  });

  it("writes red FF0000, strikethrough on any colour, and grey 6.5 pt evidence codes", async () => {
    const { document } = await build();
    const runs = [...document.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((m) => m[1]);
    const red = runs.filter((r) => r.includes(`<w:color w:val="${COLOR_RED}"/>`));
    expect(red.some((r) => r.includes("The teacher writes on the board.") && !r.includes("<w:strike"))).toBe(true);
    expect(red.some((r) => r.includes("wrong addition") && r.includes("<w:strike/>"))).toBe(true);
    const struckBlack = runs.filter((r) => r.includes('<w:color w:val="000000"/>') && r.includes("<w:strike/>"));
    expect(struckBlack.length).toBeGreaterThan(0);
    const evidence = runs.filter((r) => r.includes(`<w:color w:val="${COLOR_EVIDENCE}"/>`) && r.includes('<w:sz w:val="13"/>'));
    expect(evidence.length).toBeGreaterThan(20);
    expect(evidence.some((r) => r.includes("<w:strike/>"))).toBe(true);
  });

  it("never writes tracked changes", async () => {
    const { document, settings } = await build();
    for (const tag of ["w:ins", "w:del", "w:moveFrom", "w:moveTo", "w:rPrChange", "w:pPrChange"]) {
      expect(document).not.toContain(`<${tag} `);
      expect(document).not.toContain(`<${tag}>`);
    }
    expect(settings ?? "").not.toContain("trackRevisions");
  });

  it("reproduces the review template with the answers and measured time", async () => {
    const { document } = await build();
    const text = [...document.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
    expect(text).toContain("Narrative review: N-0003");
    expect(text).toContain("Reviewer: Test Reviewer");
    expect(text).toContain("1. Accuracy and errors");
    expect(text).toContain("Mostly accurate.");
    expect(text).toContain("Two misattributed speakers.");
    expect(text).toContain("3. Overall lesson tone and learning environment");
    expect(text).toContain("95 minutes (measured by the platform)");
    expect(text).toContain("AI NARRATIVE (copy of NARRATIVE.md; original text in black)");
    expect(text).toContain("LESSON NARRATIVE");
  });

  it("names files the way the team does", () => {
    expect(docxFilename(1, "99903_12", "Test Reviewer")).toBe("01_99903_12_NARRATIVE_review_Test.docx");
    expect(docxFilename(12, "N-0003", "Ana María")).toBe("12_N-0003_NARRATIVE_review_Ana.docx");
  });
});
