/**
 * Parser for the HAPI pipeline's NARRATIVE.md (STATUS §7). Despite the
 * extension it is structured plain text:
 *
 *   === LESSON NARRATIVE — <lesson id> (duration mm:ss) ===
 *   <hard-wrapped preamble>
 *   Evidence state: …
 *
 *   GIVEN FACTS SUPPLIED BY THE CONTEXT CARD (…):
 *     [given] mm:ss - mm:ss — <fact>
 *   Everything else below was derived by the pipeline from the recording.
 *
 *   --- E01 [m:ss-m:ss] ---
 *   <paragraph with «speech» and evidence codes [W01-V0001, C0017]>
 *   (covers: W01-S0001, …)
 *
 * Tolerates the two irregularities seen in the real files (a leading space
 * before "===", a stray line between blocks): unknown lines are kept as
 * plain paragraphs and reported as warnings, never dropped.
 */
import type { PMMark, PMNode } from "./doc";

export const PARSER_VERSION = "hapi-narrative-v1";

export interface ParsedEpisode {
  code: string;
  times: string;
  paragraphs: string[];
  covers: string | null;
  /** Lines after the covers line (irregular; kept in place, flagged). */
  trailing: string[];
}

export interface ParsedNarrative {
  lessonId: string | null;
  duration: string | null;
  title: string;
  preamble: string[];
  givenHeading: string | null;
  given: string[];
  afterGiven: string[];
  episodes: ParsedEpisode[];
  stray: string[];
  warnings: string[];
}

const TITLE = /^\s*===\s*LESSON NARRATIVE\s*[—–-]\s*(.+?)\s*\(duration\s*([0-9:]+)\)\s*===\s*$/;
const EPISODE = /^\s*---\s*(E\d+)\s*\[([^\]]+)\]\s*---\s*$/;
const COVERS = /^\s*\(covers:/;
const GIVEN_HEADING = /^\s*GIVEN FACTS\b/;
const GIVEN_LINE = /^\s+\[given\]/;

/** "0:00-0:37" → "00:00-00:37" (as the Word review documents show it). */
export function padTimes(times: string): string {
  return times
    .split("-")
    .map((t) => {
      const parts = t.trim().split(":");
      if (parts.length < 2 || parts.some((x) => !/^\d+$/.test(x))) return t.trim();
      parts[0] = parts[0].padStart(2, "0");
      return parts.join(":");
    })
    .join("-");
}

export function parseNarrative(raw: string): ParsedNarrative {
  const lines = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const out: ParsedNarrative = {
    lessonId: null,
    duration: null,
    title: "",
    preamble: [],
    givenHeading: null,
    given: [],
    afterGiven: [],
    episodes: [],
    stray: [],
    warnings: [],
  };

  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const m = TITLE.exec(lines[i] ?? "");
  if (m) {
    out.lessonId = m[1].trim();
    out.duration = m[2];
    out.title = (lines[i] ?? "").trim().replace(/^===\s*|\s*===$/g, "");
    i++;
  } else {
    out.warnings.push("No title line of the form '=== LESSON NARRATIVE — <id> (duration mm:ss) ==='.");
    out.title = "LESSON NARRATIVE";
  }

  // Preamble: lines up to the GIVEN FACTS heading (or the first episode).
  // Hard-wrapped lines join into one paragraph; "Evidence state:" starts its own.
  let para: string[] = [];
  const flush = (into: string[]) => {
    if (para.length) into.push(para.join(" ").replace(/\s+/g, " ").trim());
    para = [];
  };
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (GIVEN_HEADING.test(line) || EPISODE.test(line)) break;
    if (line.trim() === "") {
      flush(out.preamble);
      continue;
    }
    if (/^\s*Evidence state:/.test(line)) flush(out.preamble);
    para.push(line.trim());
  }
  flush(out.preamble);

  // Given facts.
  if (i < lines.length && GIVEN_HEADING.test(lines[i])) {
    out.givenHeading = lines[i].trim();
    i++;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (EPISODE.test(line)) break;
      if (GIVEN_LINE.test(line)) {
        out.given.push(line.trim());
      } else if (line.trim() !== "") {
        out.afterGiven.push(line.trim());
      }
    }
  }

  // Episodes.
  let current: ParsedEpisode | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const e = EPISODE.exec(line);
    if (e) {
      current = { code: e[1], times: padTimes(e[2].trim()), paragraphs: [], covers: null, trailing: [] };
      out.episodes.push(current);
      continue;
    }
    if (line.trim() === "") continue;
    if (!current) {
      out.stray.push(line.trim());
      out.warnings.push(`Unexpected line before the first episode: "${line.trim().slice(0, 60)}"`);
      continue;
    }
    if (COVERS.test(line)) {
      current.covers = line.trim();
      continue;
    }
    if (current.covers !== null) {
      // Text after the covers line belongs to no known slot: keep it in
      // place, flag it.
      out.warnings.push(`Unexpected line after ${current.code}'s covers line: "${line.trim().slice(0, 60)}"`);
      current.trailing.push(line.trim());
      continue;
    }
    current.paragraphs.push(line.trim());
  }

  if (out.episodes.length === 0) out.warnings.push("No episodes found ('--- E01 [m:ss-m:ss] ---').");
  for (const ep of out.episodes) {
    if (ep.paragraphs.length === 0) out.warnings.push(`${ep.code} has no text.`);
  }
  return out;
}

/** Replace every occurrence of the lesson id (Amendment §54). */
export function redactLessonId(raw: string, lessonId: string, replacement: string): string {
  if (!lessonId) return raw;
  return raw.split(lessonId).join(replacement);
}

/* ------------------------------------------------------------------ */
/* To the editor document                                              */
/* ------------------------------------------------------------------ */

const CODE = String.raw`(?:[A-Z]\d{2}-[A-Z]\d{4}|C\d{4})`;
const EVIDENCE_GROUP = new RegExp(String.raw` ?\[${CODE}(?:,\s*${CODE})*\]`, "g");

const EVIDENCE: PMMark = { type: "evidence" };

function text(t: string, marks?: PMMark[]): PMNode {
  return marks && marks.length ? { type: "text", text: t, marks } : { type: "text", text: t };
}

/** Split prose into plain text and grey evidence-code runs. */
export function inlineWithEvidence(s: string): PMNode[] {
  const nodes: PMNode[] = [];
  let last = 0;
  for (const m of s.matchAll(EVIDENCE_GROUP)) {
    if (m.index! > last) nodes.push(text(s.slice(last, m.index)));
    nodes.push(text(m[0], [EVIDENCE]));
    last = m.index! + m[0].length;
  }
  if (last < s.length) nodes.push(text(s.slice(last)));
  return nodes;
}

function paragraph(content: PMNode[], variant: "given" | "covers" | null = null): PMNode {
  const node: PMNode = { type: "paragraph", attrs: { variant } };
  if (content.length) node.content = content;
  return node;
}

function heading(level: 1 | 2, t: string): PMNode {
  return { type: "heading", attrs: { level }, content: [text(t)] };
}

/** The editor document an enumerator starts from. */
export function narrativeToDoc(p: ParsedNarrative): PMNode {
  const content: PMNode[] = [heading(1, p.title)];
  for (const pre of p.preamble) content.push(paragraph([text(pre)]));
  if (p.givenHeading) content.push(paragraph([text(p.givenHeading)]));
  for (const g of p.given) content.push(paragraph([text(g)], "given"));
  for (const a of p.afterGiven) content.push(paragraph([text(a)]));
  for (const s of p.stray) content.push(paragraph([text(s)]));
  for (const ep of p.episodes) {
    content.push(heading(2, `${ep.code} [${ep.times}]`));
    for (const para of ep.paragraphs) content.push(paragraph(inlineWithEvidence(para)));
    if (ep.covers) content.push(paragraph([text(ep.covers, [EVIDENCE])], "covers"));
    for (const t of ep.trailing) content.push(paragraph(inlineWithEvidence(t)));
  }
  return { type: "doc", content };
}
