/**
 * Reliability statistics for an ordinal four-point scale (addendum §9):
 * exact and adjacent agreement, quadratic-weighted kappa, Krippendorff's
 * alpha (ordinal metric), and per-coder mean signed deviation from the
 * consensus. Pure functions over numbers — no database — so every formula
 * is unit-tested against hand-computed values.
 *
 * Conventions: scores are integers 1..4 (CLAUDE.md §4). A statistic that is
 * undefined (no variance, too few pairs) is returned as null, never as 0 or
 * 1, so a dashboard cannot mistake "not computable" for "perfect".
 */

export const CATEGORIES = [1, 2, 3, 4] as const;

/** Chance-corrected statistics need at least this many rated units. */
export const MIN_PAIRS = 2;

export interface RatingPair {
  a: number;
  b: number;
}

export function exactAgreement(pairs: RatingPair[]): number | null {
  if (pairs.length === 0) return null;
  return pairs.filter((p) => p.a === p.b).length / pairs.length;
}

export function adjacentAgreement(pairs: RatingPair[]): number | null {
  if (pairs.length === 0) return null;
  return pairs.filter((p) => Math.abs(p.a - p.b) <= 1).length / pairs.length;
}

/**
 * Cohen's kappa with quadratic weights w_ij = (i−j)² / (k−1)².
 * κ_w = 1 − Σ w·O / Σ w·E, where O is the observed cross-tab and E the
 * product of the marginals. Null when the expected disagreement is zero
 * (both raters used a single category).
 */
export function quadraticWeightedKappa(pairs: RatingPair[], k = 4): number | null {
  const n = pairs.length;
  if (n < MIN_PAIRS) return null;
  const O: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const p of pairs) O[p.a - 1][p.b - 1] += 1;
  const rowM = O.map((r) => r.reduce((s, x) => s + x, 0));
  const colM = Array.from({ length: k }, (_, j) => O.reduce((s, r) => s + r[j], 0));
  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = ((i - j) * (i - j)) / ((k - 1) * (k - 1));
      num += w * O[i][j];
      den += w * ((rowM[i] * colM[j]) / n);
    }
  }
  if (den === 0) return null;
  return 1 - num / den;
}

/**
 * Krippendorff's alpha, ordinal metric, any number of raters per unit
 * (units with fewer than two ratings are ignored). Coincidence-matrix
 * formulation:
 *   o_ck = Σ_u (pairs of c,k values in unit u) / (m_u − 1)
 *   δ²_ck (ordinal) = ( Σ_{g=c}^{k} n_g − (n_c + n_k)/2 )²
 *   D_o = Σ o_ck δ²_ck / n ;  D_e = Σ n_c n_k δ²_ck / (n (n−1))
 *   α = 1 − D_o / D_e   (null when D_e = 0)
 */
export function krippendorffAlphaOrdinal(units: number[][], k = 4): number | null {
  const o: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  let ratedUnits = 0;
  for (const u of units) {
    const vals = u.filter((v) => Number.isInteger(v) && v >= 1 && v <= k);
    const m = vals.length;
    if (m < 2) continue;
    ratedUnits++;
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        if (i === j) continue;
        o[vals[i] - 1][vals[j] - 1] += 1 / (m - 1);
      }
    }
  }
  const nc = o.map((row) => row.reduce((s, x) => s + x, 0));
  const n = nc.reduce((s, x) => s + x, 0);
  if (ratedUnits < MIN_PAIRS || n <= 1) return null;

  const delta2 = (c: number, kk: number): number => {
    if (c === kk) return 0;
    const lo = Math.min(c, kk);
    const hi = Math.max(c, kk);
    let sum = 0;
    for (let g = lo; g <= hi; g++) sum += nc[g];
    const d = sum - (nc[lo] + nc[hi]) / 2;
    return d * d;
  };

  let Do = 0;
  let De = 0;
  for (let c = 0; c < k; c++) {
    for (let kk = 0; kk < k; kk++) {
      const d2 = delta2(c, kk);
      Do += o[c][kk] * d2;
      De += nc[c] * nc[kk] * d2;
    }
  }
  Do /= n;
  De /= n * (n - 1);
  if (De === 0) return null;
  return 1 - Do / De;
}

/** Mean of (coder − reference); positive = the coder runs high (toward B). */
export function meanSignedDeviation(pairs: RatingPair[]): number | null {
  if (pairs.length === 0) return null;
  return pairs.reduce((s, p) => s + (p.a - p.b), 0) / pairs.length;
}

/* ------------------------- study-level aggregation ------------------------- */

export interface CalibrationRecord {
  itemNo: number;
  anchorId: string;
  enumeratorId: string;
  anchorScore: number;
  enumeratorScore: number;
  finalScore: number;
}

export interface AgreementStats {
  n: number;
  exact: number | null;
  adjacent: number | null;
  kappaW: number | null;
  alpha: number | null;
}

export interface ItemReliability extends AgreementStats {
  itemNo: number;
}

export interface CoderReliability {
  coderId: string;
  /** Items where this coder's individual score met a signed consensus. */
  n: number;
  exactWithConsensus: number | null;
  meanSignedDeviation: number | null;
  /** Share of items where the coder's column (A/B) differed from the consensus column. */
  columnFlips: number | null;
}

export interface ReliabilitySummary {
  videos: number;
  overall: AgreementStats;
  perItem: ItemReliability[];
  perCoder: CoderReliability[];
}

function agreement(pairs: RatingPair[]): AgreementStats {
  return {
    n: pairs.length,
    exact: exactAgreement(pairs),
    adjacent: adjacentAgreement(pairs),
    kappaW: quadraticWeightedKappa(pairs),
    alpha: krippendorffAlphaOrdinal(pairs.map((p) => [p.a, p.b])),
  };
}

const columnOf = (n: number) => (n <= 2 ? "A" : "B");

/** Everything the Progress screen shows, from signed calibration records. */
export function summarizeReliability(records: CalibrationRecord[], videoCount: number): ReliabilitySummary {
  const all = records.map((r) => ({ a: r.anchorScore, b: r.enumeratorScore }));
  const perItem: ItemReliability[] = [];
  for (const itemNo of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const mine = records.filter((r) => r.itemNo === itemNo).map((r) => ({ a: r.anchorScore, b: r.enumeratorScore }));
    perItem.push({ itemNo, ...agreement(mine) });
  }
  const byCoder = new Map<string, RatingPair[]>();
  for (const r of records) {
    (byCoder.get(r.anchorId) ?? byCoder.set(r.anchorId, []).get(r.anchorId)!).push({ a: r.anchorScore, b: r.finalScore });
    (byCoder.get(r.enumeratorId) ?? byCoder.set(r.enumeratorId, []).get(r.enumeratorId)!).push({
      a: r.enumeratorScore,
      b: r.finalScore,
    });
  }
  const perCoder: CoderReliability[] = [...byCoder.entries()].map(([coderId, pairs]) => ({
    coderId,
    n: pairs.length,
    exactWithConsensus: exactAgreement(pairs),
    meanSignedDeviation: meanSignedDeviation(pairs),
    columnFlips: pairs.length ? pairs.filter((p) => columnOf(p.a) !== columnOf(p.b)).length / pairs.length : null,
  }));
  perCoder.sort((x, y) => (y.meanSignedDeviation ?? 0) - (x.meanSignedDeviation ?? 0));
  return { videos: videoCount, overall: agreement(all), perItem, perCoder };
}
