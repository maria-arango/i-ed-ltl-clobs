/**
 * The video-assignment algorithm (addendum §6, Amendment A, Amendment B §2).
 * PURE: no database, no clock, no Math.random — everything flows from the
 * inputs and the seed, so every run is reproducible and the process can be
 * described exactly in the paper.
 *
 * What it guarantees, each of which has a test:
 * - Deterministic from (input, seed). Different seeds shuffle differently.
 * - Arm blocking within the wave: each pair's allocation matches the
 *   candidate pool's arm mix (largest-remainder targets, ±1). Coders drift
 *   over time, so no pair/week may skew toward one arm (addendum §6).
 * - School spread: within a pair's wave the same school is avoided while
 *   alternatives exist, and history counts carry across waves, so school
 *   effects never become coder effects and no coder sees same-school runs.
 * - Context-card duty (Amendment A): exactly one of the two coders fills
 *   the card, balanced toward half WITHIN the pair and corrected by each
 *   coder's history across waves.
 * - Videos without an arm are never assigned (school 22103 until resolved);
 *   they are reported in diagnostics instead.
 */

export type Arm = "control" | "dispersed" | "connected";

export interface AlgoVideo {
  id: string;
  sid: string;
  arm: Arm | null;
}

export interface AlgoPair {
  id: string;
  anchorId: string; // admin or chief coder
  enumeratorId: string;
  /** Videos this pair should receive this wave (from FTE-derived targets). */
  capacity: number;
}

export interface AlgoHistory {
  /** Prior same-school assignments per pair: pairId → sid → count. */
  pairSchoolCounts?: Record<string, Record<string, number>>;
  /** Prior card duty per coder: userId → { filled, total }. */
  coderCardCounts?: Record<string, { filled: number; total: number }>;
}

export interface AlgoAssignment {
  videoId: string;
  pairId: string;
  /** The coder who fills the context card (anchor or enumerator). */
  cardFillerId: string;
}

export interface AlgoResult {
  assignments: AlgoAssignment[];
  diagnostics: {
    poolSize: number;
    assigned: number;
    skippedNoArm: string[]; // video ids held back (arm unresolved)
    perPairArmCounts: Record<string, Record<Arm, number>>;
    perPairMaxSameSchool: Record<string, number>;
    perCoderCardCounts: Record<string, { filled: number; total: number }>;
  };
}

/* ------------------------- seeded randomness ------------------------- */

/** mulberry32 over a string hash — the same generator the import used. */
function seededRandom(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ----------------------------- targets ------------------------------ */

const ARMS: Arm[] = ["control", "dispersed", "connected"];

/**
 * Largest-remainder allocation of a pair's capacity across arms, following
 * the candidate pool's mix. Sum of targets === capacity (or the pool's
 * remaining stock if smaller — handled at pick time).
 */
function armTargets(
  capacity: number,
  poolByArm: Record<Arm, number>,
): Record<Arm, number> {
  const poolTotal = ARMS.reduce((s, a) => s + poolByArm[a], 0);
  if (poolTotal === 0) return { control: 0, dispersed: 0, connected: 0 };
  const raw = ARMS.map((a) => ({
    arm: a,
    exact: (capacity * poolByArm[a]) / poolTotal,
  }));
  const targets = Object.fromEntries(
    raw.map((r) => [r.arm, Math.floor(r.exact)]),
  ) as Record<Arm, number>;
  let remaining = capacity - ARMS.reduce((s, a) => s + targets[a], 0);
  const byRemainder = [...raw].sort(
    (x, y) => (y.exact - Math.floor(y.exact)) - (x.exact - Math.floor(x.exact)),
  );
  for (const r of byRemainder) {
    if (remaining <= 0) break;
    targets[r.arm] += 1;
    remaining -= 1;
  }
  return targets;
}

/* ------------------------------ main -------------------------------- */

export function assignWave(input: {
  videos: AlgoVideo[];
  pairs: AlgoPair[];
  seed: string;
  history?: AlgoHistory;
}): AlgoResult {
  const { videos, pairs, seed, history = {} } = input;

  for (const p of pairs) {
    if (p.anchorId === p.enumeratorId) {
      throw new Error(`Pair ${p.id}: anchor and enumerator are the same person`);
    }
    if (!Number.isInteger(p.capacity) || p.capacity < 0) {
      throw new Error(`Pair ${p.id}: invalid capacity ${p.capacity}`);
    }
  }
  const seen = new Set<string>();
  for (const v of videos) {
    if (seen.has(v.id)) throw new Error(`Duplicate video ${v.id}`);
    seen.add(v.id);
  }

  const rand = seededRandom(seed);

  const skippedNoArm = videos.filter((v) => v.arm === null).map((v) => v.id);
  const candidates = videos.filter((v): v is AlgoVideo & { arm: Arm } =>
    v.arm !== null,
  );

  // Arm queues, independently shuffled.
  const queues: Record<Arm, (AlgoVideo & { arm: Arm })[]> = {
    control: [],
    dispersed: [],
    connected: [],
  };
  for (const v of candidates) queues[v.arm].push(v);
  for (const a of ARMS) queues[a] = shuffled(queues[a], rand);

  const poolByArm = Object.fromEntries(
    ARMS.map((a) => [a, queues[a].length]),
  ) as Record<Arm, number>;

  // Per-pair state.
  const pairOrder = shuffled(pairs, rand);
  const state = new Map(
    pairOrder.map((p) => [
      p.id,
      {
        pair: p,
        targets: armTargets(p.capacity, poolByArm),
        got: { control: 0, dispersed: 0, connected: 0 } as Record<Arm, number>,
        schoolCounts: { ...(history.pairSchoolCounts?.[p.id] ?? {}) },
        waveSchoolCounts: {} as Record<string, number>,
        assigned: [] as (AlgoVideo & { arm: Arm })[],
      },
    ]),
  );

  const cardCounts = new Map<string, { filled: number; total: number }>();
  const cardStateFor = (userId: string) => {
    if (!cardCounts.has(userId)) {
      cardCounts.set(userId, {
        filled: history.coderCardCounts?.[userId]?.filled ?? 0,
        total: history.coderCardCounts?.[userId]?.total ?? 0,
      });
    }
    return cardCounts.get(userId)!;
  };

  const assignments: AlgoAssignment[] = [];
  const totalCapacity = pairs.reduce((s, p) => s + p.capacity, 0);
  const totalSlots = Math.min(totalCapacity, candidates.length);

  // Round-robin over pairs, one video per turn, until slots are exhausted.
  let dealt = 0;
  let safety = totalSlots * pairs.length + pairs.length + 8;
  while (dealt < totalSlots && safety-- > 0) {
    let progressed = false;
    for (const s of state.values()) {
      if (dealt >= totalSlots) break;
      const remainingForPair =
        s.pair.capacity - ARMS.reduce((sum, a) => sum + s.got[a], 0);
      if (remainingForPair <= 0) continue;

      // The arm this pair is most behind on, among arms with stock.
      const candidateArms = ARMS.filter((a) => queues[a].length > 0);
      if (candidateArms.length === 0) break;
      candidateArms.sort((a, b) => {
        const deficitA = s.targets[a] - s.got[a];
        const deficitB = s.targets[b] - s.got[b];
        if (deficitB !== deficitA) return deficitB - deficitA;
        return queues[b].length - queues[a].length; // then biggest stock
      });
      const arm = candidateArms[0];

      // Within the arm queue, prefer the school this pair has seen least
      // (history + this wave), and never the same school as the pair's
      // previous pick while an alternative exists. Look at a bounded window
      // so the scan stays O(1)-ish per pick.
      const queue = queues[arm];
      const prevSid = s.assigned[s.assigned.length - 1]?.sid;
      const WINDOW = Math.min(queue.length, 24);
      let bestIdx = 0;
      let bestKey = Number.POSITIVE_INFINITY;
      for (let i = 0; i < WINDOW; i++) {
        const sid = queue[i].sid;
        const seenCount =
          (s.schoolCounts[sid] ?? 0) + (s.waveSchoolCounts[sid] ?? 0);
        const key = seenCount * 2 + (sid === prevSid ? 1 : 0);
        if (key < bestKey) {
          bestKey = key;
          bestIdx = i;
          if (key === 0) break;
        }
      }
      const video = queue.splice(bestIdx, 1)[0];

      // Card duty: the member with the lower fill ratio takes the card;
      // ties break by fewer absolute fills, then by seeded coin.
      const anchor = cardStateFor(s.pair.anchorId);
      const enumerator = cardStateFor(s.pair.enumeratorId);
      const ratio = (c: { filled: number; total: number }) =>
        c.total === 0 ? 0.5 : c.filled / c.total;
      let fillerId: string;
      if (ratio(anchor) < ratio(enumerator)) fillerId = s.pair.anchorId;
      else if (ratio(enumerator) < ratio(anchor)) fillerId = s.pair.enumeratorId;
      else if (anchor.filled !== enumerator.filled) {
        fillerId =
          anchor.filled < enumerator.filled
            ? s.pair.anchorId
            : s.pair.enumeratorId;
      } else {
        fillerId = rand() < 0.5 ? s.pair.anchorId : s.pair.enumeratorId;
      }
      anchor.total += 1;
      enumerator.total += 1;
      cardStateFor(fillerId).filled += 1;

      s.got[arm] += 1;
      s.waveSchoolCounts[video.sid] = (s.waveSchoolCounts[video.sid] ?? 0) + 1;
      s.assigned.push(video);
      assignments.push({ videoId: video.id, pairId: s.pair.id, cardFillerId: fillerId });
      dealt += 1;
      progressed = true;
    }
    if (!progressed) break; // pairs full or stock empty
  }

  return {
    assignments,
    diagnostics: {
      poolSize: candidates.length,
      assigned: assignments.length,
      skippedNoArm,
      perPairArmCounts: Object.fromEntries(
        [...state.values()].map((s) => [s.pair.id, { ...s.got }]),
      ),
      perPairMaxSameSchool: Object.fromEntries(
        [...state.values()].map((s) => [
          s.pair.id,
          Math.max(0, ...Object.values(s.waveSchoolCounts)),
        ]),
      ),
      perCoderCardCounts: Object.fromEntries(
        [...cardCounts.entries()].map(([k, v]) => [k, { ...v }]),
      ),
    },
  };
}
