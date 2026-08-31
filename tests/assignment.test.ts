/**
 * CLAUDE.md testing floor: the assignment algorithm's balance properties
 * across arm, school and coder, and its reproducibility from a fixed seed.
 * Pure tests — no database.
 */
import { describe, expect, it } from "vitest";
import {
  assignWave,
  type AlgoPair,
  type AlgoVideo,
  type Arm,
} from "@/lib/assignment/algorithm";

/* --------------------------- synthetic pool -------------------------- */

/** 300 videos: 40 schools, arm mix 40/30/30, deterministic layout. */
function makeVideos(): AlgoVideo[] {
  const videos: AlgoVideo[] = [];
  const arms: Arm[] = [
    ...Array(120).fill("control"),
    ...Array(90).fill("dispersed"),
    ...Array(90).fill("connected"),
  ];
  for (let i = 0; i < 300; i++) {
    videos.push({
      id: `v${String(i).padStart(3, "0")}`,
      // schools cluster: same school shares an arm (school-level randomisation)
      sid: `s${String(Math.floor(i / 7.5))}`,
      arm: arms[i],
    });
  }
  return videos;
}

function makePairs(n = 6, capacity = 15): AlgoPair[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `pair${i}`,
    anchorId: `anchor${i}`,
    enumeratorId: `enum${i}`,
    capacity,
  }));
}

const poolMix = (videos: AlgoVideo[]) => {
  const mix: Record<string, number> = {};
  for (const v of videos) if (v.arm) mix[v.arm] = (mix[v.arm] ?? 0) + 1;
  return mix;
};

/* ------------------------------- tests ------------------------------- */

describe("reproducibility", () => {
  it("identical input + seed produces identical output", () => {
    const a = assignWave({ videos: makeVideos(), pairs: makePairs(), seed: "wave-1" });
    const b = assignWave({ videos: makeVideos(), pairs: makePairs(), seed: "wave-1" });
    expect(a).toEqual(b);
  });

  it("a different seed produces a different allocation", () => {
    const a = assignWave({ videos: makeVideos(), pairs: makePairs(), seed: "wave-1" });
    const b = assignWave({ videos: makeVideos(), pairs: makePairs(), seed: "wave-2" });
    expect(a.assignments.map((x) => x.videoId).join()).not.toEqual(
      b.assignments.map((x) => x.videoId).join(),
    );
  });
});

describe("integrity", () => {
  it("assigns each video at most once and fills every pair to capacity", () => {
    const pairs = makePairs(6, 15);
    const r = assignWave({ videos: makeVideos(), pairs, seed: "s" });
    const ids = r.assignments.map((a) => a.videoId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.assignments).toHaveLength(90);
    for (const p of pairs) {
      expect(r.assignments.filter((a) => a.pairId === p.id)).toHaveLength(15);
    }
  });

  it("never assigns a video without an arm, and reports it", () => {
    const videos = makeVideos();
    videos[0].arm = null;
    videos[7].arm = null;
    const r = assignWave({ videos, pairs: makePairs(), seed: "s" });
    const assigned = new Set(r.assignments.map((a) => a.videoId));
    expect(assigned.has(videos[0].id)).toBe(false);
    expect(r.diagnostics.skippedNoArm).toEqual([videos[0].id, videos[7].id]);
  });

  it("refuses a pair whose anchor and enumerator are the same person", () => {
    const pairs = makePairs();
    pairs[0].enumeratorId = pairs[0].anchorId;
    expect(() =>
      assignWave({ videos: makeVideos(), pairs, seed: "s" }),
    ).toThrow(/same person/);
  });
});

describe("arm blocking (addendum §6)", () => {
  it("each pair's wave matches the pool's arm mix within ±1 of the target", () => {
    const videos = makeVideos();
    const mix = poolMix(videos); // 120/90/90 → per 15: 6/4.5/4.5
    const total = videos.length;
    const r = assignWave({ videos, pairs: makePairs(6, 15), seed: "block" });
    for (const counts of Object.values(r.diagnostics.perPairArmCounts)) {
      for (const arm of ["control", "dispersed", "connected"] as const) {
        const exact = (15 * mix[arm]) / total;
        expect(Math.abs(counts[arm] - exact)).toBeLessThanOrEqual(1);
      }
      expect(counts.control + counts.dispersed + counts.connected).toBe(15);
    }
  });

  it("holds across many seeds", () => {
    const videos = makeVideos();
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const r = assignWave({ videos, pairs: makePairs(4, 12), seed });
      for (const counts of Object.values(r.diagnostics.perPairArmCounts)) {
        // 12 × (0.4 / 0.3 / 0.3) = 4.8 / 3.6 / 3.6
        expect(Math.abs(counts.control - 4.8)).toBeLessThanOrEqual(1.2);
        expect(Math.abs(counts.dispersed - 3.6)).toBeLessThanOrEqual(1.4);
        expect(Math.abs(counts.connected - 3.6)).toBeLessThanOrEqual(1.4);
      }
    }
  });
});

describe("school spread (addendum §6)", () => {
  it("no pair receives a same-school run, and same-school repeats stay rare", () => {
    const r = assignWave({ videos: makeVideos(), pairs: makePairs(6, 15), seed: "school" });
    // With 40 schools and window-based picking, a pair should almost never
    // see the same school twice in one wave, and never more than twice.
    for (const max of Object.values(r.diagnostics.perPairMaxSameSchool)) {
      expect(max).toBeLessThanOrEqual(2);
    }
  });

  it("avoids schools a pair has already seen in earlier waves", () => {
    const videos = makeVideos();
    const pairs = makePairs(1, 10);
    // History: pair0 has already coded many videos from schools s0–s3.
    const history = {
      pairSchoolCounts: {
        pair0: { s0: 3, s1: 3, s2: 3, s3: 3 },
      },
    };
    const r = assignWave({ videos, pairs, seed: "hist", history });
    const sids = r.assignments.map(
      (a) => videos.find((v) => v.id === a.videoId)!.sid,
    );
    const overexposed = sids.filter((s) => ["s0", "s1", "s2", "s3"].includes(s));
    expect(overexposed.length).toBe(0);
  });
});

describe("context-card duty (Amendment A)", () => {
  it("splits card duty within ±1 of half inside every pair", () => {
    const pairs = makePairs(6, 15);
    const r = assignWave({ videos: makeVideos(), pairs, seed: "cards" });
    for (const p of pairs) {
      const mine = r.assignments.filter((a) => a.pairId === p.id);
      const anchorFills = mine.filter((a) => a.cardFillerId === p.anchorId).length;
      expect(Math.abs(anchorFills - mine.length / 2)).toBeLessThanOrEqual(0.5);
      // Every filler is one of the two members.
      for (const a of mine) {
        expect([p.anchorId, p.enumeratorId]).toContain(a.cardFillerId);
      }
    }
  });

  it("compensates a coder whose history is card-heavy", () => {
    const pairs = makePairs(1, 12);
    const history = {
      coderCardCounts: {
        anchor0: { filled: 20, total: 24 }, // has filled far more than half
        enum0: { filled: 4, total: 24 },
      },
    };
    const r = assignWave({ videos: makeVideos(), pairs, seed: "comp", history });
    const anchorFills = r.assignments.filter(
      (a) => a.cardFillerId === "anchor0",
    ).length;
    // The under-filled enumerator takes most of this wave's cards.
    expect(anchorFills).toBeLessThanOrEqual(3);
  });
});

describe("scarcity", () => {
  it("stops cleanly when the pool is smaller than total capacity", () => {
    const videos = makeVideos().slice(0, 20);
    const r = assignWave({ videos, pairs: makePairs(6, 15), seed: "scarce" });
    expect(r.assignments).toHaveLength(20);
    const ids = r.assignments.map((a) => a.videoId);
    expect(new Set(ids).size).toBe(20);
  });
});
