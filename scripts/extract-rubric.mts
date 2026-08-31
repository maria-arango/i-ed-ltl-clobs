/**
 * Extract the instrument from docs/rubric/20260822_CLOBS.tex into
 * db/seed/rubric-2026-08-22.json (rubric content is data, not code —
 * CLAUDE.md §5). The seed script loads the JSON into the rubric_* tables.
 *
 * The .tex is the authoritative source; this parser targets its exact macro
 * conventions (\conceptheader, \twopane, \specialnote, \scoregrid) and
 * FAILS LOUDLY on anything unexpected rather than guessing.
 *
 * Usage: node scripts/extract-rubric.mts   (writes the JSON, prints a summary)
 */
import { readFileSync, writeFileSync } from "node:fs";

const TEX = "docs/rubric/20260822_CLOBS.tex";
const OUT = "db/seed/rubric-2026-08-22.json";
const VERSION_LABEL = "2026-08-22";

// Canonical short names, fixed order (addendum §4).
const CONCEPT_NAMES: Record<number, string> = {
  1: "Cooperative and collective learning",
  2: "Teacher creates opportunities for intellectual agency",
  3: "Pupils independently exercise intellectual agency",
  4: "Critical thinking and deeper learning",
  5: "Scaffolding",
  6: "Checks for understanding",
  7: "Specific feedback",
  8: "Connects learning to everyday life",
};

/* --------------------------- LaTeX helpers --------------------------- */

/** Strip % comments (but keep escaped \%). */
function stripComments(tex: string): string {
  return tex
    .split("\n")
    .map((line) => {
      let out = "";
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "%" && line[i - 1] !== "\\") return out;
        out += line[i];
      }
      return out;
    })
    .join("\n");
}

/** Read one {balanced} group starting at the given '{'. Returns [content, endIndex]. */
function readGroup(src: string, openBrace: number): [string, number] {
  if (src[openBrace] !== "{") {
    throw new Error(`Expected '{' at ${openBrace}, got '${src[openBrace]}'`);
  }
  let depth = 0;
  for (let i = openBrace; i < src.length; i++) {
    if (src[i] === "{" && src[i - 1] !== "\\") depth++;
    if (src[i] === "}" && src[i - 1] !== "\\") {
      depth--;
      if (depth === 0) return [src.slice(openBrace + 1, i), i];
    }
  }
  throw new Error(`Unbalanced braces from ${openBrace}`);
}

/** Read N consecutive {arg} groups following a macro occurrence. */
function readArgs(src: string, afterMacro: number, n: number): [string[], number] {
  const args: string[] = [];
  let pos = afterMacro;
  for (let k = 0; k < n; k++) {
    while (pos < src.length && /\s/.test(src[pos])) pos++;
    const [content, end] = readGroup(src, pos);
    args.push(content);
    pos = end + 1;
  }
  return [args, pos];
}

/** Convert LaTeX fragments to plain text. */
function toText(input: string): string {
  let s = input;
  // Remove argument-less macros FIRST (a following \textbf keeps the word
  // boundary intact; unwrapping first would glue words together).
  s = s
    .replace(/\\(?:footnotesize|scriptsize|small|normalsize|exlistsize|large)\b/g, "")
    .replace(/\\(?:noindent|centering|arraybackslash|raggedright)\b/g, "");
  // Unwrap simple formatting macros, innermost-first.
  for (let pass = 0; pass < 6; pass++) {
    s = s.replace(/\\(?:textbf|textit|emph|texttt|mbox|hl)\{([^{}]*)\}/g, "$1");
  }
  s = s
    .replace(/\\begin\{(?:itemize|exlist)\}(\[[^\]]*\])?/g, "")
    .replace(/\\end\{(?:itemize|exlist)\}/g, "")
    .replace(/\\item\b/g, "\n@@ITEM@@ ")
    .replace(/\\vspace\*?\{[^}]*\}/g, " ")
    .replace(/\\hspace\*?\{[^}]*\}/g, " ")
    .replace(/\\rule\{[^}]*\}\{[^}]*\}/g, " ")
    .replace(/\\color\{[^}]*\}/g, "")
    .replace(/\\textcolor\{[^}]*\}/g, "")
    .replace(/\\\\(\[[^\]]*\])?/g, " ")
    .replace(/``|''/g, '"')
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/\\ldots\b/g, "…")
    .replace(/\\dots\b/g, "…")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\ /g, " ")
    .replace(/~/g, " ")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
  if (/\\[a-zA-Z]+/.test(s.replace(/@@ITEM@@/g, ""))) {
    const leftover = s.match(/\\[a-zA-Z]+/g);
    throw new Error(`Unhandled LaTeX macro(s) in output: ${leftover?.join(", ")}\n---\n${s.slice(0, 300)}`);
  }
  return s.replace(/\n{2,}/g, "\n").trim();
}

/** Split a tabular cell group on top-level '&'. */
function splitCells(src: string): string[] {
  const cells: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{" && src[i - 1] !== "\\") depth++;
    if (ch === "}" && src[i - 1] !== "\\") depth--;
    if (ch === "&" && depth === 0 && src[i - 1] !== "\\") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function itemsOf(text: string): string[] {
  return text
    .split("@@ITEM@@")
    .map((t) => t.replace(/\n/g, " ").replace(/ +/g, " ").trim())
    .filter(Boolean);
}

/* ------------------------------ parse ------------------------------- */

const tex = stripComments(readFileSync(TEX, "utf8"));

interface Concept {
  itemNo: number;
  name: string;
  statement: string;
  importance: string;
  specialNote: string;
  indicators: string[];
  anchors: Record<number, string>;
  examples: Record<number, string[]>;
}

const concepts: Concept[] = [];
const headerRe = /\\conceptheader/g;
let m: RegExpExecArray | null;
const headerPositions: Array<{ argStart: number }> = [];
while ((m = headerRe.exec(tex))) {
  // Skip the \newcommand{\conceptheader}... definition itself.
  if (tex.slice(Math.max(0, m.index - 12), m.index).includes("newcommand{")) continue;
  headerPositions.push({ argStart: m.index + m[0].length });
}

for (const { argStart } of headerPositions) {
  const [[numArg, statementArg], afterHeader] = readArgs(tex, argStart, 2);
  const itemNo = Number(numArg);
  if (!Number.isInteger(itemNo) || itemNo < 1 || itemNo > 8) continue; // front-matter headers

  // Slice this concept's region (up to the next \conceptheader or end).
  const next = tex.indexOf("\\conceptheader", afterHeader);
  const region = tex.slice(afterHeader, next === -1 ? undefined : next);

  const twopaneAt = region.indexOf("\\twopane");
  const [[importanceArg, indicatorsArg]] = readArgs(region, twopaneAt + "\\twopane".length, 2);
  const specialAt = region.indexOf("\\specialnote");
  const [[specialArg]] = readArgs(region, specialAt + "\\specialnote".length, 1);
  const gridAt = region.indexOf("\\scoregrid");
  const [[, , anchorsArg, examplesArg]] = readArgs(region, gridAt + "\\scoregrid".length, 4);

  const anchorCells = splitCells(anchorsArg).map((c) => toText(c).replace(/\n/g, " ").trim());
  const exampleCells = splitCells(examplesArg).map((c) => itemsOf(toText(c)));
  if (anchorCells.length !== 4) throw new Error(`Concept ${itemNo}: ${anchorCells.length} anchors`);
  if (exampleCells.length !== 4) throw new Error(`Concept ${itemNo}: ${exampleCells.length} example cells`);

  concepts.push({
    itemNo,
    name: CONCEPT_NAMES[itemNo],
    statement: toText(statementArg).replace(/\n/g, " "),
    importance: toText(importanceArg).replace(/\n/g, " "),
    specialNote: toText(specialArg).replace(/\n/g, " "),
    indicators: itemsOf(toText(indicatorsArg)),
    anchors: { 1: anchorCells[0], 2: anchorCells[1], 3: anchorCells[2], 4: anchorCells[3] },
    examples: { 1: exampleCells[0], 2: exampleCells[1], 3: exampleCells[2], 4: exampleCells[3] },
  });
}

/* Guidance: the front-matter guiding rules and the shared reach scale. */

function extractLabeled(sectionSrc: string): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [];
  const re = /\\noindent\{/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(sectionSrc))) {
    let group: string;
    try {
      [group] = readGroup(sectionSrc, mm.index + "\\noindent".length);
    } catch {
      break; // a group truncated by the section boundary ends the section
    }
    const text = toText(group);
    const dot = text.indexOf(".");
    if (dot === -1) continue;
    out.push({ label: text.slice(0, dot).trim(), text: text.slice(dot + 1).trim() });
  }
  return out;
}

const rulesStart = tex.indexOf("Guiding rules for coding");
const rulesEnd = tex.indexOf("\\clearpage", rulesStart);
const guidingRules = extractLabeled(tex.slice(rulesStart, rulesEnd));

const reachStart = tex.indexOf("the shared reach scale");
const reachEnd = tex.indexOf("Decision record", reachStart);
const reachBands = extractLabeled(tex.slice(reachStart, reachEnd));

// The reach-scale intro paragraph (how to judge reach) sits before the bands.
const reachIntroGroupAt = tex.indexOf("{\\footnotesize One reach scale", reachStart);
const [reachIntroRaw] = readGroup(tex, reachIntroGroupAt);
const reachIntro = toText(reachIntroRaw);

/* ---------------------------- validate ------------------------------ */

if (concepts.length !== 8) throw new Error(`Expected 8 concepts, got ${concepts.length}`);
for (const c of concepts) {
  if (!c.statement || !c.importance || !c.specialNote) throw new Error(`Concept ${c.itemNo}: empty field`);
  if (c.indicators.length < 3) throw new Error(`Concept ${c.itemNo}: only ${c.indicators.length} indicators`);
  for (const n of [1, 2, 3, 4]) {
    if (!c.anchors[n] || c.anchors[n].length < 40) throw new Error(`Concept ${c.itemNo} anchor ${n} too short`);
    if (c.examples[n].length < 1) throw new Error(`Concept ${c.itemNo} score ${n}: no examples`);
  }
}
if (guidingRules.length < 8) throw new Error(`Only ${guidingRules.length} guiding rules found`);
if (reachBands.length !== 4) throw new Error(`Expected 4 reach bands, got ${reachBands.length}`);

/* ------------------------------ write ------------------------------- */

const output = {
  versionLabel: VERSION_LABEL,
  sourceRef: TEX,
  guidance: [
    ...guidingRules.map((g, i) => ({ kind: "guiding_rule", position: i + 1, ...g })),
    { kind: "reach_band", position: 0, label: "How to judge reach", text: reachIntro },
    ...reachBands.map((g, i) => ({ kind: "reach_band", position: i + 1, ...g })),
  ],
  concepts,
};

writeFileSync(OUT, JSON.stringify(output, null, 2) + "\n");

console.log(`Concepts: ${concepts.length}`);
for (const c of concepts) {
  console.log(
    `  ${c.itemNo}. ${c.name} — indicators ${c.indicators.length}, examples ${[1, 2, 3, 4]
      .map((n) => c.examples[n].length)
      .join("/")}`,
  );
}
console.log(`Guiding rules: ${guidingRules.length} (${guidingRules.map((g) => g.label).join(" · ")})`);
console.log(`Reach bands: ${reachBands.length} (${reachBands.map((g) => g.label).join(" · ")})`);
console.log(`Wrote ${OUT}`);
