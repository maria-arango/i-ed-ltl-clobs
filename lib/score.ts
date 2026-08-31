/**
 * The fixed score encoding (CLAUDE.md §4). This table is the single source:
 * 1 = A Very · 2 = A Somewhat · 3 = B Somewhat · 4 = B Very.
 * All three fields are stored on every score row; nothing is re-derived at
 * read time. These helpers exist for WRITE-time construction and for
 * rendering labels, and they are what the round-trip test exercises.
 */

export type ScoreNum = 1 | 2 | 3 | 4;
export type ScoreColumn = "A" | "B";
export type ScoreDegree = "somewhat" | "very";

export interface ScoreTriple {
  scoreNum: ScoreNum;
  scoreColumn: ScoreColumn;
  scoreDegree: ScoreDegree;
}

/** The four legal combinations, in fixed order. Never reorder, never re-map. */
export const SCORE_TABLE: readonly ScoreTriple[] = [
  { scoreNum: 1, scoreColumn: "A", scoreDegree: "very" },
  { scoreNum: 2, scoreColumn: "A", scoreDegree: "somewhat" },
  { scoreNum: 3, scoreColumn: "B", scoreDegree: "somewhat" },
  { scoreNum: 4, scoreColumn: "B", scoreDegree: "very" },
] as const;

const DEGREE_LABEL: Record<ScoreDegree, string> = {
  somewhat: "Somewhat Accurate",
  very: "Very Accurate",
};

/** Build the full triple from the numeric value, for write-time use. */
export function tripleFromNum(num: number): ScoreTriple {
  const triple = SCORE_TABLE.find((t) => t.scoreNum === num);
  if (!triple) {
    throw new Error(`Invalid score number: ${num}. Must be 1–4.`);
  }
  return triple;
}

/** Human label, e.g. "Column B — Somewhat Accurate". */
export function labelFor(triple: ScoreTriple): string {
  return `Column ${triple.scoreColumn} — ${DEGREE_LABEL[triple.scoreDegree]}`;
}

/** True iff the triple is one of the four legal combinations. */
export function isLegalTriple(t: {
  scoreNum: number;
  scoreColumn: string;
  scoreDegree: string;
}): boolean {
  return SCORE_TABLE.some(
    (s) =>
      s.scoreNum === t.scoreNum &&
      s.scoreColumn === t.scoreColumn &&
      s.scoreDegree === t.scoreDegree,
  );
}
