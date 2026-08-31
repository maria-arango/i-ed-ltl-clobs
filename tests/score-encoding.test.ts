/**
 * CLAUDE.md testing floor: the score encoding and the score/label round trip.
 * The encoding is fixed for the life of the study:
 * 1 = A Very · 2 = A Somewhat · 3 = B Somewhat · 4 = B Very.
 * If any assertion here ever needs to change, something is wrong with the
 * change, not with the test.
 */
import { describe, expect, it } from "vitest";
import {
  isLegalTriple,
  labelFor,
  SCORE_TABLE,
  tripleFromNum,
} from "@/lib/score";

describe("the fixed score encoding", () => {
  it("has exactly four entries in fixed order 1..4", () => {
    expect(SCORE_TABLE.map((t) => t.scoreNum)).toEqual([1, 2, 3, 4]);
  });

  it("maps each number to the fixed column and degree", () => {
    expect(tripleFromNum(1)).toEqual({
      scoreNum: 1,
      scoreColumn: "A",
      scoreDegree: "very",
    });
    expect(tripleFromNum(2)).toEqual({
      scoreNum: 2,
      scoreColumn: "A",
      scoreDegree: "somewhat",
    });
    expect(tripleFromNum(3)).toEqual({
      scoreNum: 3,
      scoreColumn: "B",
      scoreDegree: "somewhat",
    });
    expect(tripleFromNum(4)).toEqual({
      scoreNum: 4,
      scoreColumn: "B",
      scoreDegree: "very",
    });
  });

  it("column B is always the positive end (3 and 4)", () => {
    for (const t of SCORE_TABLE) {
      expect(t.scoreColumn).toBe(t.scoreNum >= 3 ? "B" : "A");
    }
  });

  it("degree is 'very' at the extremes and 'somewhat' in the middle", () => {
    for (const t of SCORE_TABLE) {
      expect(t.scoreDegree).toBe(
        t.scoreNum === 1 || t.scoreNum === 4 ? "very" : "somewhat",
      );
    }
  });

  it("rejects anything outside 1–4", () => {
    for (const bad of [0, 5, -1, 2.5, NaN]) {
      expect(() => tripleFromNum(bad)).toThrow();
    }
  });
});

describe("the score/label round trip", () => {
  it("renders the exact labels from the instrument", () => {
    expect(labelFor(tripleFromNum(1))).toBe("Column A — Very Accurate");
    expect(labelFor(tripleFromNum(2))).toBe("Column A — Somewhat Accurate");
    expect(labelFor(tripleFromNum(3))).toBe("Column B — Somewhat Accurate");
    expect(labelFor(tripleFromNum(4))).toBe("Column B — Very Accurate");
  });

  it("every stored triple validates; every mismatched triple is rejected", () => {
    for (const t of SCORE_TABLE) {
      expect(isLegalTriple(t)).toBe(true);
    }
    // All 4×2×2 = 16 combinations; only the 4 canonical ones are legal.
    let legal = 0;
    for (const scoreNum of [1, 2, 3, 4]) {
      for (const scoreColumn of ["A", "B"]) {
        for (const scoreDegree of ["somewhat", "very"]) {
          if (isLegalTriple({ scoreNum, scoreColumn, scoreDegree })) legal++;
        }
      }
    }
    expect(legal).toBe(4);
  });
});
