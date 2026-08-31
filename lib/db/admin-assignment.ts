/**
 * Admin assignment layer: pair management and assignment waves.
 * Waves are PREVIEWED (pure computation, nothing written) and then
 * CONFIRMED — the confirm re-runs the same seeded algorithm and refuses
 * if the inputs changed since the preview (hash check), so what the admin
 * saw is exactly what is written. Every decision lands in assignment_log
 * with its seed (addendum §6: reproducible and reportable).
 */
import { createHash } from "node:crypto";
import { and, asc, count, eq, isNull, max, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentLog,
  assignmentRaters,
  assignments,
  auditLog,
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

/* ------------------------------- waves ------------------------------- */

async function getWaveInputs(dataset: Dataset) {
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

  const [waveRow] = await db
    .select({ maxWave: max(assignments.waveNo) })
    .from(assignments)
    .where(eq(assignments.dataset, dataset));
  const waveNo = (waveRow.maxWave ?? 0) + 1;

  return { pool, pairViews, history: { pairSchoolCounts, coderCardCounts } satisfies AlgoHistory, waveNo };
}

function inputsHash(pool: { id: string }[], pairViews: PairView[], videosPerPair: number): string {
  const h = createHash("sha256");
  h.update(String(videosPerPair));
  h.update(pool.map((v) => v.id).sort().join(","));
  h.update(pairViews.map((p) => p.id).sort().join(","));
  return h.digest("hex").slice(0, 16);
}

export interface WavePreview {
  waveNo: number;
  seed: string;
  videosPerPair: number;
  poolSize: number;
  totalToAssign: number;
  skippedNoArm: number;
  hash: string;
  perPair: Array<{
    pairId: string;
    label: string | null;
    count: number;
    arms: Record<Arm, number>;
    maxSameSchool: number;
    anchorFillsCards: number;
    sampleCodes: string[];
  }>;
}

function compute(dataset: Dataset, seed: string, videosPerPair: number) {
  return getWaveInputs(dataset).then(({ pool, pairViews, history, waveNo }) => {
    const algoVideos: AlgoVideo[] = pool.map((v) => ({ id: v.id, sid: v.sid, arm: v.arm }));
    const algoPairs: AlgoPair[] = pairViews.map((p) => ({
      id: p.id,
      anchorId: p.anchor.id,
      enumeratorId: p.enumerator.id,
      capacity: videosPerPair,
    }));
    const result = assignWave({ videos: algoVideos, pairs: algoPairs, seed, history });
    return { pool, pairViews, waveNo, result, hash: inputsHash(pool, pairViews, videosPerPair) };
  });
}

export async function previewWave(
  seed: string,
  videosPerPair: number,
  dataset: Dataset = "live",
): Promise<{ ok: true; preview: WavePreview } | { ok: false; error: string }> {
  if (!seed.trim()) return { ok: false, error: "A seed is required (it makes the wave reproducible)." };
  if (!Number.isInteger(videosPerPair) || videosPerPair < 1 || videosPerPair > 60) {
    return { ok: false, error: "Videos per pair must be between 1 and 60." };
  }
  const { pool, pairViews, waveNo, result, hash } = await compute(dataset, seed.trim(), videosPerPair);
  if (pairViews.length === 0) return { ok: false, error: "No active pairs — create pairs first." };
  const codeById = new Map(pool.map((v) => [v.id, v.displayCode]));
  return {
    ok: true,
    preview: {
      waveNo,
      seed: seed.trim(),
      videosPerPair,
      poolSize: result.diagnostics.poolSize,
      totalToAssign: result.diagnostics.assigned,
      skippedNoArm: result.diagnostics.skippedNoArm.length,
      hash,
      perPair: pairViews.map((p) => {
        const mine = result.assignments.filter((a) => a.pairId === p.id);
        return {
          pairId: p.id,
          label: p.label,
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
  videosPerPair: number,
  expectedHash: string,
  dataset: Dataset = "live",
): Promise<{ ok: true; waveNo: number; assigned: number } | { ok: false; error: string }> {
  const { pairViews, waveNo, result, hash } = await compute(dataset, seed.trim(), videosPerPair);
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
        videosPerPair,
        assigned: result.assignments.length,
        skippedNoArm: result.diagnostics.skippedNoArm.length,
      },
    });
  });

  return { ok: true, waveNo, assigned: result.assignments.length };
}
