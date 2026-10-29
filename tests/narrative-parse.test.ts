/**
 * The NARRATIVE.md parser and document helpers (STATUS §7, ADR 0002).
 * Fixtures are the synthetic placeholders (decision D7) plus inline
 * samples of the two irregularities seen in the real files.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  narrativeToDoc,
  padTimes,
  parseNarrative,
  redactLessonId,
} from "@/lib/narratives/parse";
import { docStats, plainText, type PMNode } from "@/lib/narratives/doc";
import { narrativeSchema, validateNarrativeDoc } from "@/lib/narratives/editor-schema";
import { makePlaceholderNarrative, PLACEHOLDERS } from "@/lib/narratives/placeholder";

const SAMPLE = readFileSync("db/seed/narratives/placeholder-99903_12.md", "utf8");

describe("parseNarrative", () => {
  it("reads title, duration, preamble, given facts and every episode", () => {
    const p = parseNarrative(SAMPLE);
    expect(p.lessonId).toBe("99903_12");
    expect(p.duration).toMatch(/^\d+:\d{2}$/);
    expect(p.preamble).toHaveLength(2); // joined hard-wrapped paragraph + evidence state
    expect(p.preamble[0]).toMatch(/^A VIEW of the evidence ledger.*never omitted\.$/);
    expect(p.preamble[1]).toMatch(/^Evidence state:/);
    expect(p.given).toHaveLength(3);
    expect(p.afterGiven).toEqual(["Everything else below was derived by the pipeline from the recording."]);
    expect(p.episodes).toHaveLength(25);
    expect(p.episodes[0].code).toBe("E01");
    expect(p.episodes[0].times).toBe("00:00-00:42");
    expect(p.episodes.every((e) => e.covers?.startsWith("(covers:"))).toBe(true);
    expect(p.warnings).toEqual([]);
  });

  it("keeps a stray line after a covers line in place (seen in one real file)", () => {
    const odd = SAMPLE.replace("\n\n--- E03", "\n1\n\n--- E03");
    const p = parseNarrative(odd);
    expect(p.episodes[1].trailing).toEqual(["1"]);
    const blocks = narrativeToDoc(p).content!;
    const i = blocks.findIndex((b) => b.content?.[0]?.text === "1");
    expect(blocks[i - 1].attrs?.variant).toBe("covers");
  });

  it("tolerates a leading space before === and a stray line, keeping the stray text", () => {
    const odd = " " + SAMPLE.replace("\n--- E02", "\n1\n--- E02");
    const p = parseNarrative(odd);
    expect(p.lessonId).toBe("99903_12");
    expect(p.episodes).toHaveLength(25);
    expect(p.warnings.length).toBeGreaterThan(0);
    // the stray "1" is not lost
    expect(plainText(narrativeToDoc(p))).toContain("\n1\n");
  });

  it("reports a file that is not a narrative instead of guessing", () => {
    const p = parseNarrative("hello\nworld\n");
    expect(p.lessonId).toBeNull();
    expect(p.warnings.join(" ")).toMatch(/No title line/);
    expect(p.warnings.join(" ")).toMatch(/No episodes/);
  });

  it("pads episode times the way the Word documents show them", () => {
    expect(padTimes("0:00-0:37")).toBe("00:00-00:37");
    expect(padTimes("58:07-58:45")).toBe("58:07-58:45");
    expect(padTimes("1:02:03-1:02:40")).toBe("01:02:03-01:02:40");
  });
});

describe("narrativeToDoc", () => {
  const doc = narrativeToDoc(parseNarrative(SAMPLE));

  it("produces a document the editor schema accepts", () => {
    expect(validateNarrativeDoc(doc)).toEqual({ ok: true });
  });

  it("keeps every word of the source, in order", () => {
    const words = (s: string) => s.split(/\s+/).filter(Boolean);
    // Only change allowed: episode times are zero-padded (00:42, not 0:42).
    const src = words(
      SAMPLE.replace(/^=== | ===$/gm, "")
        .replace(/^--- (E\d+) \[([^\]]+)\] ---$/gm, (_m, e: string, t: string) => `${e} [${padTimes(t)}]`),
    );
    const out = words(plainText(doc));
    expect(out).toEqual(src);
  });

  it("marks evidence codes grey, including the covers line, and nothing else", () => {
    const body = doc.content!.find((b) => b.type === "paragraph" && b.content?.some((t) => t.marks))!;
    const ev = body.content!.filter((t) => t.marks?.some((m) => m.type === "evidence"));
    expect(ev.length).toBeGreaterThan(0);
    for (const t of ev) expect(t.text).toMatch(/^ ?\[(?:[A-Z]\d{2}-[A-Z]\d{4}|C\d{4})(?:, (?:[A-Z]\d{2}-[A-Z]\d{4}|C\d{4}))*\]$/);
    const covers = doc.content!.filter((b) => b.attrs?.variant === "covers");
    expect(covers).toHaveLength(25);
    const given = doc.content!.filter((b) => b.attrs?.variant === "given");
    expect(given).toHaveLength(3);
  });

  it("refuses marks and nodes the editor cannot produce", () => {
    const bad: PMNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold" }] }] }] };
    expect(validateNarrativeDoc(bad).ok).toBe(false);
    expect(validateNarrativeDoc({ type: "doc", content: [{ type: "table" }] }).ok).toBe(false);
    expect(validateNarrativeDoc("not json").ok).toBe(false);
  });
});

describe("redactLessonId (Amendment §54)", () => {
  it("removes every occurrence so the platform stores none", () => {
    const red = redactLessonId(SAMPLE, "99903_12", "Narrative 3");
    expect(red).not.toContain("99903_12");
    const p = parseNarrative(red);
    expect(p.lessonId).toBe("Narrative 3");
    expect(p.episodes).toHaveLength(25);
  });
});

describe("docStats", () => {
  const original = narrativeToDoc(parseNarrative(SAMPLE));
  const clone = (): PMNode => JSON.parse(JSON.stringify(original));

  it("counts red, struck and anchored comments; striking keeps original words", () => {
    const d = clone();
    const para = d.content!.find((b) => b.type === "paragraph" && b.attrs?.variant === null && b.content?.length)!;
    const first = para.content![0];
    first.marks = [{ type: "strike" }, { type: "comment", attrs: { commentId: "c1" } }];
    para.content!.splice(1, 0, { type: "text", text: "added words", marks: [{ type: "textColor", attrs: { color: "red" } }] });
    const s = docStats(d, [
      { id: "c1", body: "check", authorId: "u", authorName: "U", createdAt: "", updatedAt: "" },
      { id: "c-orphan", body: "x", authorId: "u", authorName: "U", createdAt: "", updatedAt: "" },
    ], original);
    expect(s.redChars).toBe("added words".length);
    expect(s.struckChars).toBe(first.text!.length);
    expect(s.comments).toBe(1);
    expect(s.originalWordsRemoved).toBe(0);
  });

  it("counts deleted original words", () => {
    const d = clone();
    const para = d.content!.find((b) => b.type === "paragraph" && b.attrs?.variant === null && b.content?.length)!;
    const removedText = para.content![0].text!;
    para.content!.splice(0, 1);
    const s = docStats(d, [], original);
    expect(s.originalWordsRemoved).toBe(removedText.split(/\s+/).filter(Boolean).length);
  });
});

describe("placeholders (decision D7)", () => {
  it("are deterministic and match the committed seed files", () => {
    for (const p of PLACEHOLDERS) {
      expect(makePlaceholderNarrative(p)).toBe(readFileSync(`db/seed/narratives/${p.file}`, "utf8"));
    }
  });
});

describe("editor schema conventions", () => {
  it("does not extend strikethrough to text typed right after it", () => {
    // "Strike the wrong words, then type the correction in red" must not
    // produce a struck correction (found in the browser walkthrough).
    expect(narrativeSchema.marks.strike.spec.inclusive).toBe(false);
    expect(narrativeSchema.marks.evidence.spec.inclusive).toBe(false);
    expect(narrativeSchema.marks.comment.spec.inclusive).toBe(false);
    // red continues while typing
    expect(narrativeSchema.marks.textColor.spec.inclusive).not.toBe(false);
  });
  it("allows overlapping comments", () => {
    expect(narrativeSchema.marks.comment.spec.excludes).toBe("");
  });
});
