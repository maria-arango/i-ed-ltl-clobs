/**
 * Reliability statistics (addendum §9) against hand-computed values. Pure
 * — no database.
 */
import { describe, expect, it } from "vitest";
import {
  adjacentAgreement,
  exactAgreement,
  krippendorffAlphaOrdinal,
  meanSignedDeviation,
  quadraticWeightedKappa,
  summarizeReliability,
} from "@/lib/reliability";

const pairsOf = (a: number[], b: number[]) => a.map((x, i) => ({ a: x, b: b[i] }));

describe("agreement", () => {
  it("exact and adjacent", () => {
    const p = pairsOf([1, 2, 3, 4, 1, 2, 3, 4], [1, 3, 3, 2, 1, 2, 3, 4]);
    expect(exactAgreement(p)).toBe(6 / 8);
    expect(adjacentAgreement(p)).toBe(7 / 8);
    expect(exactAgreement([])).toBeNull();
  });

  it("quadratic-weighted kappa: 1 on perfect agreement, 0 on independence, null without variance", () => {
    expect(quadraticWeightedKappa(pairsOf([1, 2, 3, 4], [1, 2, 3, 4]))).toBeCloseTo(1, 10);
    // Fully crossed 2×2 table on categories 1 and 4 → expected == observed → 0.
    expect(quadraticWeightedKappa(pairsOf([1, 1, 4, 4], [1, 4, 1, 4]))).toBeCloseTo(0, 10);
    expect(quadraticWeightedKappa(pairsOf([2, 2, 2], [2, 2, 2]))).toBeNull();
  });

  it("quadratic-weighted kappa: a hand-computed table", () => {
    // Rater A: 1,1,2,2,3,3,4,4 ; Rater B: 1,2,2,3,3,4,4,4
    // O (row=A, col=B): [1,1,0,0],[0,1,1,0],[0,0,1,1],[0,0,0,2]
    // Row marginals 2,2,2,2 ; col marginals 1,2,2,3 ; n = 8
    // w(i,j) = (i−j)²/9. Σ w·O = 3·(1/9) = 1/3.
    // Σ w·E = Σ_ij w_ij · r_i c_j / 8 = (2/8)·Σ_i Σ_j w_ij c_j
    //   i=1: (0·1 + 1·2 + 4·2 + 9·3)/9 = 37/9 ; i=2: (1·1 + 0 + 1·2 + 4·3)/9 = 15/9
    //   i=3: (4·1 + 1·2 + 0 + 1·3)/9 = 9/9 ; i=4: (9·1 + 4·2 + 1·2 + 0)/9 = 19/9
    //   total = 80/9 · (2/8) = 20/9
    // κ_w = 1 − (1/3)/(20/9) = 1 − 3/20 = 0.85
    const k = quadraticWeightedKappa(pairsOf([1, 1, 2, 2, 3, 3, 4, 4], [1, 2, 2, 3, 3, 4, 4, 4]));
    expect(k).toBeCloseTo(0.85, 10);
  });

  it("Krippendorff's alpha (ordinal): 1 on agreement, −0.5 on two fully reversed units, null without variance", () => {
    expect(krippendorffAlphaOrdinal([[1, 1], [2, 2], [3, 3], [4, 4]])).toBeCloseTo(1, 10);
    // Units [1,2] and [2,1]: n_1 = n_2 = 2, δ²_12 = (4 − 2)² = 4,
    // D_o = (2·4 + 2·4)/4 = 4, D_e = (2·2·4·2)/(4·3) = 8/3 → α = 1 − 4/(8/3) = −0.5
    expect(krippendorffAlphaOrdinal([[1, 2], [2, 1]])).toBeCloseTo(-0.5, 10);
    expect(krippendorffAlphaOrdinal([[3, 3], [3, 3]])).toBeNull();
    // Units with a single rating are ignored.
    expect(krippendorffAlphaOrdinal([[1], [2, 2], [3, 3]])).toBeCloseTo(1, 10);
  });

  it("Krippendorff's alpha handles more than two raters per unit", () => {
    // Three raters, unit values [1,1,2] and [3,3,3] and [4,4,3].
    // Just a sanity envelope: better than chance but not perfect.
    const a = krippendorffAlphaOrdinal([[1, 1, 2], [3, 3, 3], [4, 4, 3]]);
    expect(a).not.toBeNull();
    expect(a!).toBeGreaterThan(0.5);
    expect(a!).toBeLessThan(1);
  });

  it("mean signed deviation: positive when the coder runs high", () => {
    expect(meanSignedDeviation(pairsOf([2, 3, 4], [1, 2, 4]))).toBeCloseTo(2 / 3, 10);
    expect(meanSignedDeviation(pairsOf([1, 1], [3, 3]))).toBe(-2);
  });
});

describe("summarizeReliability", () => {
  it("aggregates overall, per item and per coder from calibration records", () => {
    const records = [1, 2, 3, 4, 5, 6, 7, 8].map((itemNo) => ({
      itemNo,
      anchorId: "anchor",
      enumeratorId: "enum",
      anchorScore: [1, 2, 3, 4, 1, 2, 3, 4][itemNo - 1],
      enumeratorScore: [1, 3, 3, 2, 1, 2, 3, 4][itemNo - 1],
      finalScore: [1, 2, 3, 3, 1, 2, 3, 4][itemNo - 1],
    }));
    const s = summarizeReliability(records, 1);
    expect(s.videos).toBe(1);
    expect(s.overall.n).toBe(8);
    expect(s.overall.exact).toBe(6 / 8);
    expect(s.overall.adjacent).toBe(7 / 8);
    expect(s.perItem).toHaveLength(8);
    expect(s.perItem[1]).toMatchObject({ itemNo: 2, n: 1, exact: 0, adjacent: 1 });
    // One pair per item → kappa/alpha undefined, reported as null, not 0.
    expect(s.perItem[1].kappaW).toBeNull();
    expect(s.perItem[1].alpha).toBeNull();

    const anchor = s.perCoder.find((c) => c.coderId === "anchor")!;
    const en = s.perCoder.find((c) => c.coderId === "enum")!;
    expect(anchor.n).toBe(8);
    // Anchor differs from the consensus only on item 4 (4 vs 3): +1/8.
    expect(anchor.meanSignedDeviation).toBeCloseTo(1 / 8, 10);
    expect(anchor.exactWithConsensus).toBe(7 / 8);
    // Enumerator: item 2 (3 vs 2) +1, item 4 (2 vs 3) −1 → 0; two misses.
    expect(en.meanSignedDeviation).toBeCloseTo(0, 10);
    expect(en.exactWithConsensus).toBe(6 / 8);
    // Both enumerator misses crossed the A/B divide; the anchor's (4 vs 3)
    // stayed inside column B.
    expect(en.columnFlips).toBe(2 / 8);
    expect(anchor.columnFlips).toBe(0);
  });
});
