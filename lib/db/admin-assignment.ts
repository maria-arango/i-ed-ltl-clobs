/**
 * Admin assignment layer: pair management and assignment waves.
 * Waves are PREVIEWED (pure computation, nothing written) and then
 * CONFIRMED — the confirm re-runs the same seeded algorithm and refuses
 * if the inputs changed since the preview (hash check), so what the admin
 * saw is exactly what is written. Every decision lands in assignment_log
 * with its seed (addendum §6: reproducible and reportable).
 */
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, max, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentLog,
  assignmentRaters,
  assignments,
  auditLog,
  coderAvailability,
  pairMembers,
  pairs,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";
import { assignWave, type AlgoHistory, type AlgoPair, type AlgoVideo, type Arm } from "@/lib/assignment/algorithm";

const ALGORITHM_VERSION = "wave-v1";
type Dataset = "live" | "test" | "training";

/* ------------------------------- pairs ------------------------------- */

export interface PairView {
  id: string;
  label: string | null;
  anchor: { id: string; name: string | null; email: string };
  enumerator: { id: string; name: string | null; email: string };
  activeAssignments: number;
}

export async function listPairs(dataset: Dataset = "live"): Promise<PairView[]> {
  const rows = await db
    .select({
      pairId: pairs.id,
      label: pairs.label,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isChiefCoder: users.isChiefCoder,
    })
    .from(pairs)
    .innerJoin(pairMembers, eq(pairMembers.pairId, pairs.id))
    .innerJoin(users, eq(users.id, pairMembers.userId))
    .where(and(eq(pairs.dataset, dataset), isNull(pairs.dissolvedAt), isNull(pairMembers.leftAt)))
    .orderBy(asc(pairs.formedAt));

  const byPair = new Map<string, { label: string | null; members: typeof rows }>();
  for (const r of rows) {
    if (!byPair.has(r.pairId)) byPair.set(r.pairId, { label: r.label, members: [] });
    byPair.get(r.pairId)!.members.push(r);
  }

  const counts = await db
    .select({ pairId: assignments.pairId, n: count() })
    .from(assignments)
    .where(and(eq(assignments.dataset, dataset), eq(assignments.status, "active")))
    .groupBy(assignments.pairId);
  const countByPair = new Map(counts.map((c) => [c.pairId, Number(c.n)]));

  const out: PairView[] = [];
  for (const [pairId, entry] of byPair) {
    if (entry.members.length !== 2) continue; // malformed — hidden from view
    const anchor = entry.members.find((m) => m.role === "admin" || m.isChiefCoder);
    const enumerator = entry.members.find((m) => m !== anchor);
    if (!anchor || !enumerator) continue;
    out.push({
      id: pairId,
      label: entry.label,
      anchor: { id: anchor.userId, name: anchor.name, email: anchor.email },
      enumerator: { id: enumerator.userId, name: enumerator.name, email: enumerator.email },
      activeAssignments: countByPair.get(pairId) ?? 0,
    });
  }
  return out;
}

/** People eligible for the two pair seats (Amendment B §2). */
export async function listPairCandidates() {
  const active = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isChiefCoder: users.isChiefCoder,
    })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.datasetScope, "live")))
    .orderBy(asc(users.email));
  return {
    anchors: active.filter((u) => u.role === "admin" || u.isChiefCoder),
    enumerators: active.filter((u) => u.role === "coder" && !u.isChiefCoder),
  };
}

export async function createPair(
  actorId: string,
  anchorId: string,
  enumeratorId: string,
  dataset: Dataset = "live",
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (anchorId === enumeratorId) {
    return { ok: false, error: "A pair needs two different people." };
  }
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isChiefCoder: users.isChiefCoder, isActive: users.isActive })
    .from(users)
    .where(eq(users.isActive, true));
  const anchor = members.find((m) => m.id === anchorId);
  const enumerator = members.find((m) => m.id === enumeratorId);
  if (!anchor || !enumerator) return { ok: false, error: "Both people must be active accounts." };
  if (!(anchor.role === "admin" || anchor.isChiefCoder)) {
    return { ok: false, error: "The anchor must be an admin or a chief coder (Amendment B)." };
  }
  if (enumerator.role !== "coder" || enumerator.isChiefCoder) {
    return { ok: false, error: "The second seat is for a (non-chief) coder." };
  }
  // No duplicate active pair with the same two people.
  const existing = await listPairs(dataset);
  if (existing.some((p) =>
    (p.anchor.id === anchorId && p.enumerator.id === enumeratorId))) {
    return { ok: false, error: "That pair already exists." };
  }
  const label = `${anchor.name ?? anchor.email} × ${enumerator.name ?? enumerator.email}`;
  const [pair] = await db.insert(pairs).values({ label, dataset }).returning({ id: pairs.id });
  await db.insert(pairMembers).values([
    { pairId: pair.id, userId: anchorId },
    { pairId: pair.id, userId: enumeratorId },
  ]);
  await db.insert(auditLog).values({
    actorId,
    action: "pair_created",
    subjectTable: "pairs",
    subjectId: pair.id,
    details: { anchor: anchor.email, enumerator: enumerator.email },
  });
  return { ok: true };
}

export async function dissolvePair(
  actorId: string,
  pairId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [active] = await db
    .select({ n: count() })
    .from(assignments)
    .where(and(eq(assignments.pairId, pairId), eq(assignments.status, "active")));
  if (Number(active.n) > 0) {
    return {
      ok: false,
      error: `This pair still has ${active.n} active assignment(s). Reassignment tooling arrives with the next stage — until then, dissolve only empty pairs.`,
    };
  }
  await db
    .update(pairs)
    .set({ dissolvedAt: new Date(), dissolvedReason: "Dissolved from the Assignment screen" })
    .where(eq(pairs.id, pairId));
  await db.insert(auditLog).values({
    actorId,
    action: "pair_dissolved",
    subjectTable: "pairs",
    subjectId: pairId,
    details: {},
  });
  return { ok: true };
}

/* --------------------------- availability ---------------------------- */

/**
 * Effective videos/day per user AT a given date (Amendment B §18/§25):
 * the newest availability entry whose range covers that date. A week plan
 * saved on the Assignment screen inserts entries scoped to the week, and
 * "newest wins" makes them govern that week without touching the rest of
 * the record. No entry = full time (3/day).
 */
async function getVideosPerDayMap(
  userIds: string[],
  at: Date,
): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};
  const rows = await db
    .select({
      userId: coderAvailability.userId,
      videosPerDay: coderAvailability.videosPerDay,
      effectiveFrom: coderAvailability.effectiveFrom,
      effectiveTo: coderAvailability.effectiveTo,
    })
    .from(coderAvailability)
    .orderBy(desc(coderAvailability.createdAt));
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (map[r.userId] !== undefined) continue;
    if (r.effectiveFrom > at) continue; // starts later (e.g. back on Sept 16)
    if (r.effectiveTo && r.effectiveTo < at) continue;
    map[r.userId] = r.videosPerDay;
  }
  for (const id of userIds) map[id] ??= 3;
  return map;
}

/** Parse a yyyy-mm-dd string to a UTC noon Date (immune to timezones). */
function parseDay(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface WeekRosterRow {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  isChiefCoder: boolean;
  videosPerDay: number;
}

/** The active team with each person's effective videos/day at a date. */
export async function getWeekRoster(weekStartIso: string): Promise<WeekRosterRow[]> {
  const at = parseDay(weekStartIso) ?? new Date();
  const team = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isChiefCoder: users.isChiefCoder,
    })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.datasetScope, "live")))
    .orderBy(asc(users.email));
  const visible = team.filter((t) => !t.email.endsWith("@example.invalid"));
  const vpd = await getVideosPerDayMap(visible.map((t) => t.userId), at);
  return visible.map((t) => ({ ...t, videosPerDay: vpd[t.userId] }));
}

/**
 * Save a week plan (Amendment B §25): one availability entry per person
 * scoped to [weekStart, weekEnd], written only where the value actually
 * changes. History is append-only; nothing is edited or removed.
 */
export async function setWeekPlan(
  actorId: string,
  weekStartIso: string,
  weekEndIso: string,
  entries: Array<{ userId: string; videosPerDay: number }>,
): Promise<{ ok: true; changed: number } | { ok: false; error: string }> {
  const from = parseDay(weekStartIso);
  const to = parseDay(weekEndIso);
  if (!from || !to) return { ok: false, error: "Both week dates are required." };
  if (to < from) return { ok: false, error: "The week ends before it starts." };
  for (const e of entries) {
    if (!(e.videosPerDay >= 0 && e.videosPerDay <= 6)) {
      return { ok: false, error: "Videos per day must be between 0 and 6." };
    }
  }
  const current = await getVideosPerDayMap(entries.map((e) => e.userId), from);
  let changed = 0;
  for (const e of entries) {
    if (current[e.userId] === e.videosPerDay) continue;
    await db.insert(coderAvailability).values({
      userId: e.userId,
      videosPerDay: e.videosPerDay,
      fteFraction: Math.round((e.videosPerDay / 3) * 100),
      effectiveFrom: from,
      effectiveTo: to,
    });
    changed++;
  }
  await db.insert(auditLog).values({
    actorId,
    action: "week_plan_set",
    subjectTable: "coder_availability",
    details: {
      week: `${weekStartIso}..${weekEndIso}`,
      entries: Object.fromEntries(entries.map((e) => [e.userId, e.videosPerDay])),
      changed,
    },
  });
  return { ok: true, changed };
}

/* ------------------------------- waves ------------------------------- */

async function getWaveInputs(dataset: Dataset, weekStart: Date) {
  const pool = await db
    .select({ id: videos.id, sid: videoProvenance.sid, arm: videoProvenance.arm, displayCode: videos.displayCode })
    .from(videos)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .where(and(eq(videos.dataset, dataset), eq(videos.status, "pool"), eq(videoProvenance.excluded, false)));

  const pairViews = await listPairs(dataset);

  // History: same-school exposure per pair, card duty per coder.
  const schoolRows = await db
    .select({ pairId: assignments.pairId, sid: videoProvenance.sid, n: count() })
    .from(assignments)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, assignments.videoId))
    .where(and(eq(assignments.dataset, dataset), ne(assignments.status, "voided")))
    .groupBy(assignments.pairId, videoProvenance.sid);
  const pairSchoolCounts: Record<string, Record<string, number>> = {};
  for (const r of schoolRows) {
    (pairSchoolCounts[r.pairId] ??= {})[r.sid] = Number(r.n);
  }

  const cardRows = await db
    .select({ userId: assignmentRaters.userId, fills: assignmentRaters.fillsContextCard, n: count() })
    .from(assignmentRaters)
    .innerJoin(assignments, eq(assignments.id, assignmentRaters.assignmentId))
    .where(and(eq(assignments.dataset, dataset), ne(assignments.status, "voided")))
    .groupBy(assignmentRaters.userId, assignmentRaters.fillsContextCard);
  const coderCardCounts: Record<string, { filled: number; total: number }> = {};
  for (const r of cardRows) {
    const entry = (coderCardCounts[r.userId] ??= { filled: 0, total: 0 });
    entry.total += Number(r.n);
    if (r.fills) entry.filled += Number(r.n);
  }

  // Only assignments created by a confirmed wave carry assignedBy; counting
  // those (not demo/fixture rows inserted directly) keeps wave numbering
  // stable — and deterministic when test suites run in parallel.
  const [waveRow] = await db
    .select({ maxWave: max(assignments.waveNo) })
    .from(assignments)
    .where(and(eq(assignments.dataset, dataset), isNotNull(assignments.assignedBy)));
  const waveNo = (waveRow.maxWave ?? 0) + 1;

  const memberIds = pairViews.flatMap((p) => [p.anchor.id, p.enumerator.id]);
  const vpd = await getVideosPerDayMap(memberIds, weekStart);

  return {
    pool,
    pairViews,
    vpd,
    history: { pairSchoolCounts, coderCardCounts } satisfies AlgoHistory,
    waveNo,
  };
}

function inputsHash(
  pool: { id: string }[],
  pairViews: PairView[],
  waveDays: number,
  waveNo: number,
  weekStartIso: string,
): string {
  const h = createHash("sha256");
  h.update(`${waveDays}#${waveNo}#${weekStartIso}`);
  h.update(pool.map((v) => v.id).sort().join(","));
  h.update(pairViews.map((p) => p.id).sort().join(","));
  return h.digest("hex").slice(0, 16);
}

export interface WavePreview {
  waveNo: number;
  seed: string;
  weekStart: string;
  waveDays: number;
  poolSize: number;
  totalToAssign: number;
  skippedNoArm: number;
  hash: string;
  perPair: Array<{
    pairId: string;
    label: string | null;
    capacity: number;
    count: number;
    arms: Record<Arm, number>;
    maxSameSchool: number;
    anchorFillsCards: number;
    sampleCodes: string[];
  }>;
}

function compute(dataset: Dataset, seed: string, weekStartIso: string, waveDays: number) {
  const weekStart = parseDay(weekStartIso);
  if (!weekStart) throw new Error("weekStart must be a yyyy-mm-dd date");
  return getWaveInputs(dataset, weekStart).then(({ pool, pairViews, vpd, history, waveNo }) => {
    const algoVideos: AlgoVideo[] = pool.map((v) => ({ id: v.id, sid: v.sid, arm: v.arm }));
    // A pair moves at the pace of its slower member (Amendment B §18).
    const capacities = new Map(
      pairViews.map((p) => [
        p.id,
        Math.max(0, Math.round(Math.min(vpd[p.anchor.id], vpd[p.enumerator.id]) * waveDays)),
      ]),
    );
    const algoPairs: AlgoPair[] = pairViews.map((p) => ({
      id: p.id,
      anchorId: p.anchor.id,
      enumeratorId: p.enumerator.id,
      capacity: capacities.get(p.id)!,
    }));
    const result = assignWave({ videos: algoVideos, pairs: algoPairs, seed, history });
    return { pool, pairViews, capacities, waveNo, result, hash: inputsHash(pool, pairViews, waveDays, waveNo, weekStartIso) };
  });
}

export async function previewWave(
  seed: string,
  weekStartIso: string,
  waveDays: number,
  dataset: Dataset = "live",
): Promise<{ ok: true; preview: WavePreview } | { ok: false; error: string }> {
  if (!seed.trim()) return { ok: false, error: "A seed is required (it makes the wave reproducible)." };
  if (!parseDay(weekStartIso)) return { ok: false, error: "Pick the week's start date first." };
  if (!Number.isInteger(waveDays) || waveDays < 1 || waveDays > 20) {
    return { ok: false, error: "Working days must be between 1 and 20." };
  }
  const { pool, pairViews, capacities, waveNo, result, hash } = await compute(dataset, seed.trim(), weekStartIso, waveDays);
  if (pairViews.length === 0) return { ok: false, error: "No active pairs — create pairs first." };
  const codeById = new Map(pool.map((v) => [v.id, v.displayCode]));
  return {
    ok: true,
    preview: {
      waveNo,
      seed: seed.trim(),
      weekStart: weekStartIso,
      waveDays,
      poolSize: result.diagnostics.poolSize,
      totalToAssign: result.diagnostics.assigned,
      skippedNoArm: result.diagnostics.skippedNoArm.length,
      hash,
      perPair: pairViews.map((p) => {
        const mine = result.assignments.filter((a) => a.pairId === p.id);
        return {
          pairId: p.id,
          label: p.label,
          capacity: capacities.get(p.id)!,
          count: mine.length,
          arms: result.diagnostics.perPairArmCounts[p.id],
          maxSameSchool: result.diagnostics.perPairMaxSameSchool[p.id],
          anchorFillsCards: mine.filter((a) => a.cardFillerId === p.anchor.id).length,
          sampleCodes: mine.slice(0, 5).map((a) => codeById.get(a.videoId) ?? "?"),
        };
      }),
    },
  };
}

export async function confirmWave(
  actorId: string,
  seed: string,
  weekStartIso: string,
  waveDays: number,
  expectedHash: string,
  dataset: Dataset = "live",
): Promise<{ ok: true; waveNo: number; assigned: number } | { ok: false; error: string }> {
  const { pairViews, waveNo, result, hash } = await compute(dataset, seed.trim(), weekStartIso, waveDays);
  if (hash !== expectedHash) {
    return {
      ok: false,
      error: "The pool or the pairs changed since this preview. Preview again before confirming.",
    };
  }
  const pairById = new Map(pairViews.map((p) => [p.id, p]));

  await db.transaction(async (tx) => {
    for (const a of result.assignments) {
      const pair = pairById.get(a.pairId)!;
      const [assignment] = await tx
        .insert(assignments)
        .values({
          videoId: a.videoId,
          pairId: a.pairId,
          waveNo,
          dataset,
          assignedBy: actorId,
        })
        .returning({ id: assignments.id });
      const raterRows = [
        { userId: pair.anchor.id, fills: a.cardFillerId === pair.anchor.id },
        { userId: pair.enumerator.id, fills: a.cardFillerId === pair.enumerator.id },
      ];
      for (const r of raterRows) {
        await tx.insert(assignmentRaters).values({
          assignmentId: assignment.id,
          userId: r.userId,
          fillsContextCard: r.fills,
        });
        await tx.insert(assignmentLog).values({
          action: "assign",
          videoId: a.videoId,
          toPairId: a.pairId,
          toUserId: r.userId,
          fillsContextCard: r.fills,
          seed: seed.trim(),
          algorithmVersion: ALGORITHM_VERSION,
          waveNo,
          actorId,
          dataset,
        });
      }
      await tx
        .update(videos)
        .set({ status: "assigned" })
        .where(eq(videos.id, a.videoId));
    }
    await tx.insert(auditLog).values({
      actorId,
      action: "assignment_wave_confirmed",
      subjectTable: "assignments",
      details: {
        waveNo,
        seed: seed.trim(),
        algorithmVersion: ALGORITHM_VERSION,
        weekStart: weekStartIso,
        waveDays,
        assigned: result.assignments.length,
        skippedNoArm: result.diagnostics.skippedNoArm.length,
      },
    });
  });

  return { ok: true, waveNo, assigned: result.assignments.length };
}

/* --------------------------- pair rotation --------------------------- */
/* Amendment B §19: fixed pairs within a week, new randomised pairings
   between weeks, preferring combinations that have not worked together. */

function rotationRandom(seedStr: string): () => number {
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

export interface RotationPreview {
  seed: string;
  hash: string;
  proposals: Array<{
    anchor: { id: string; label: string };
    enumerator: { id: string; label: string };
    workedTogetherBefore: number;
  }>;
  unmatchedEnumerators: string[];
}

async function pastPairCounts(dataset: Dataset): Promise<Map<string, number>> {
  // Every historical pairing (including dissolved), keyed anchor|enumerator.
  const rows = await db
    .select({ pairId: pairMembers.pairId, userId: pairMembers.userId })
    .from(pairMembers)
    .innerJoin(pairs, eq(pairs.id, pairMembers.pairId))
    .where(eq(pairs.dataset, dataset));
  const byPair = new Map<string, string[]>();
  for (const r of rows) {
    (byPair.get(r.pairId) ?? byPair.set(r.pairId, []).get(r.pairId)!).push(r.userId);
  }
  const counts = new Map<string, number>();
  for (const members of byPair.values()) {
    if (members.length !== 2) continue;
    const key = [...members].sort().join("|");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function rotationHash(anchorIds: string[], enumeratorIds: string[]): string {
  const h = createHash("sha256");
  h.update(anchorIds.sort().join(","));
  h.update("::");
  h.update(enumeratorIds.sort().join(","));
  return h.digest("hex").slice(0, 16);
}

async function computeRotation(seed: string, dataset: Dataset) {
  const { anchors, enumerators } = await listPairCandidates();
  const realEnumerators = enumerators.filter((e) => !e.email.endsWith("@example.invalid"));
  const vpd = await getVideosPerDayMap([...anchors, ...realEnumerators].map((u) => u.id), new Date());
  const past = await pastPairCounts(dataset);
  const rand = rotationRandom(seed);

  const availableAnchors = anchors.filter((a) => vpd[a.id] > 0);
  // Anchor slots proportional to availability: an anchor with 3/day can
  // hold more pairs than one with 1/day. Every anchor with any capacity
  // gets at least one slot while enumerators remain.
  const totalVpd = availableAnchors.reduce((s, a) => s + vpd[a.id], 0);
  const slots: string[] = [];
  if (totalVpd > 0) {
    for (const a of availableAnchors) {
      const share = Math.max(1, Math.round((realEnumerators.length * vpd[a.id]) / totalVpd));
      for (let i = 0; i < share; i++) slots.push(a.id);
    }
  }

  // Seeded shuffle of enumerators, then greedy matching that prefers
  // never-before combinations, then fewer repeats.
  const shuffledEnums = [...realEnumerators];
  for (let i = shuffledEnums.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffledEnums[i], shuffledEnums[j]] = [shuffledEnums[j], shuffledEnums[i]];
  }
  const slotUsed = new Array(slots.length).fill(false);
  const labelOf = (u: { name: string | null; email: string }) => u.name ?? u.email;
  const anchorById = new Map(anchors.map((a) => [a.id, a]));
  const proposals: RotationPreview["proposals"] = [];
  const unmatched: string[] = [];

  for (const e of shuffledEnums) {
    let best = -1;
    let bestKey = Number.POSITIVE_INFINITY;
    for (let i = 0; i < slots.length; i++) {
      if (slotUsed[i]) continue;
      const repeats = past.get([slots[i], e.id].sort().join("|")) ?? 0;
      if (repeats < bestKey) {
        bestKey = repeats;
        best = i;
        if (repeats === 0) break;
      }
    }
    if (best === -1) {
      unmatched.push(labelOf(e));
      continue;
    }
    slotUsed[best] = true;
    const anchor = anchorById.get(slots[best])!;
    proposals.push({
      anchor: { id: anchor.id, label: labelOf(anchor) },
      enumerator: { id: e.id, label: labelOf(e) },
      workedTogetherBefore: bestKey,
    });
  }

  return {
    proposals,
    unmatched,
    hash: rotationHash(
      availableAnchors.map((a) => a.id),
      realEnumerators.map((e) => e.id),
    ),
  };
}

export async function previewRotation(
  seed: string,
  dataset: Dataset = "live",
): Promise<{ ok: true; preview: RotationPreview } | { ok: false; error: string }> {
  if (!seed.trim()) return { ok: false, error: "A seed is required." };
  const { proposals, unmatched, hash } = await computeRotation(seed.trim(), dataset);
  if (proposals.length === 0) {
    return { ok: false, error: "Nothing to rotate: add coders and anchors (with availability) first." };
  }
  return { ok: true, preview: { seed: seed.trim(), hash, proposals, unmatchedEnumerators: unmatched } };
}

/**
 * Confirm a rotation: soft-dissolve the current active pairs (history and
 * calibration references stay intact) and form the proposed set.
 */
export async function confirmRotation(
  actorId: string,
  seed: string,
  expectedHash: string,
  dataset: Dataset = "live",
): Promise<{ ok: true; formed: number } | { ok: false; error: string }> {
  const { proposals, hash } = await computeRotation(seed.trim(), dataset);
  if (hash !== expectedHash) {
    return { ok: false, error: "The team changed since this preview. Preview again before confirming." };
  }
  const current = await listPairs(dataset);
  await db.transaction(async (tx) => {
    for (const p of current) {
      await tx
        .update(pairs)
        .set({ dissolvedAt: new Date(), dissolvedReason: `Weekly rotation (${seed.trim()})` })
        .where(eq(pairs.id, p.id));
    }
    for (const prop of proposals) {
      const [pair] = await tx
        .insert(pairs)
        .values({ label: `${prop.anchor.label} × ${prop.enumerator.label}`, dataset })
        .returning({ id: pairs.id });
      await tx.insert(pairMembers).values([
        { pairId: pair.id, userId: prop.anchor.id },
        { pairId: pair.id, userId: prop.enumerator.id },
      ]);
    }
    await tx.insert(auditLog).values({
      actorId,
      action: "pairs_rotated",
      subjectTable: "pairs",
      details: { seed: seed.trim(), dissolved: current.length, formed: proposals.length },
    });
  });
  return { ok: true, formed: proposals.length };
}

/* --------------------------- pair details ----------------------------- */

export interface PairAssignmentDetails {
  total: number;
  armCounts: { control: number; dispersed: number; connected: number };
  schools: number;
  anchorCards: number;
  enumeratorCards: number;
  videos: Array<{
    displayCode: string;
    arm: string | null;
    sid: string;
    cardFiller: "anchor" | "enumerator";
    status: string;
  }>;
}

/** What one pair is holding: their dealt videos with arms, schools and
 *  card duties (ADMIN surface — arms and school ids are fine here). */
export async function getPairAssignmentDetails(
  pairId: string,
): Promise<PairAssignmentDetails> {
  const members = await db
    .select({
      userId: pairMembers.userId,
      role: users.role,
      isChiefCoder: users.isChiefCoder,
    })
    .from(pairMembers)
    .innerJoin(users, eq(users.id, pairMembers.userId))
    .where(eq(pairMembers.pairId, pairId));
  const anchorId =
    members.find((m) => m.role === "admin" || m.isChiefCoder)?.userId ?? null;

  const rows = await db
    .select({
      assignmentId: assignments.id,
      status: assignments.status,
      displayCode: videos.displayCode,
      arm: videoProvenance.arm,
      sid: videoProvenance.sid,
      fillerId: assignmentRaters.userId,
      fills: assignmentRaters.fillsContextCard,
    })
    .from(assignments)
    .innerJoin(videos, eq(videos.id, assignments.videoId))
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .innerJoin(assignmentRaters, eq(assignmentRaters.assignmentId, assignments.id))
    .where(
      and(
        eq(assignments.pairId, pairId),
        inArray(assignments.status, ["active", "completed"]),
        eq(assignmentRaters.fillsContextCard, true),
      ),
    )
    .orderBy(asc(videos.displayCode));

  const armCounts = { control: 0, dispersed: 0, connected: 0 };
  const schools = new Set<string>();
  let anchorCards = 0;
  const out = rows.map((r) => {
    if (r.arm && r.arm in armCounts) armCounts[r.arm as keyof typeof armCounts]++;
    schools.add(r.sid);
    const cardFiller: "anchor" | "enumerator" =
      r.fillerId === anchorId ? "anchor" : "enumerator";
    if (cardFiller === "anchor") anchorCards++;
    return {
      displayCode: r.displayCode,
      arm: r.arm,
      sid: r.sid,
      cardFiller,
      status: r.status,
    };
  });
  return {
    total: out.length,
    armCounts,
    schools: schools.size,
    anchorCards,
    enumeratorCards: out.length - anchorCards,
    videos: out,
  };
}
