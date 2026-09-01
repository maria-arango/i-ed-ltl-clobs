/**
 * Training space (ADMIN-ONLY). Trainee accounts are coder accounts scoped
 * to dataset='training' (Amendment B §9): disposable by design — most will
 * not survive training — but with the full coding experience. Their
 * "training pack" is the gold set, assigned as training-dataset
 * assignments, so nothing they do can ever touch live data, while their
 * scores compare directly against the master scores.
 *
 * No calibration in training (Amendment §29): packs are single-rater.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentRaters,
  assignments,
  auditLog,
  goldScores,
  notes,
  observations,
  pairMembers,
  pairs,
  scores,
  users,
  videos,
} from "@/db/schema";

const PLACEHOLDER_EMAIL = "demo-partner@example.invalid";

async function audit(actorId: string, action: string, subjectId: string, details: Record<string, unknown>) {
  await db.insert(auditLog).values({ actorId, action, subjectTable: "users", subjectId, details });
}

/** The training pack = every gold-flagged video (target 6: 2/2/2). */
async function getGoldVideoIds(): Promise<string[]> {
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.isGold, true), eq(videos.dataset, "live")))
    .orderBy(asc(videos.displayCode));
  return rows.map((r) => r.id);
}

async function getPlaceholderId(): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PLACEHOLDER_EMAIL));
  if (existing) return existing.id;
  const [created] = await db
    .insert(users)
    .values({
      email: PLACEHOLDER_EMAIL,
      name: "Demo partner (placeholder)",
      role: "coder",
      datasetScope: "training",
      isActive: false,
    })
    .returning({ id: users.id });
  return created.id;
}

/**
 * Assign the training pack (the gold videos) to one person as
 * training-dataset assignments. Works for trainees AND for admins entering
 * the sandbox. Idempotent: already-assigned videos are skipped.
 */
export async function assignTrainingPack(
  actorId: string,
  userId: string,
): Promise<{ ok: true; assigned: number; already: number } | { ok: false; error: string }> {
  const [target] = await db
    .select({ id: users.id, email: users.email, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId));
  if (!target || !target.isActive) return { ok: false, error: "No active account." };

  const goldIds = await getGoldVideoIds();
  if (goldIds.length === 0) {
    return {
      ok: false,
      error: "The gold set is empty. Add gold videos (Gold set screen) first.",
    };
  }

  // One training pair per person (anchor slot filled by the placeholder).
  const label = `training-${target.email}`;
  let [pair] = await db
    .select({ id: pairs.id })
    .from(pairs)
    .where(and(eq(pairs.label, label), eq(pairs.dataset, "training")));
  if (!pair) {
    const placeholderId = await getPlaceholderId();
    [pair] = await db
      .insert(pairs)
      .values({ label, dataset: "training" })
      .returning({ id: pairs.id });
    await db.insert(pairMembers).values([
      { pairId: pair.id, userId },
      { pairId: pair.id, userId: placeholderId },
    ]);
  }

  const existing = await db
    .select({ videoId: assignments.videoId })
    .from(assignments)
    .innerJoin(assignmentRaters, eq(assignmentRaters.assignmentId, assignments.id))
    .where(
      and(
        inArray(assignments.videoId, goldIds),
        eq(assignments.dataset, "training"),
        eq(assignmentRaters.userId, userId),
      ),
    );
  const have = new Set(existing.map((e) => e.videoId));
  const toAssign = goldIds.filter((id) => !have.has(id));

  await db.transaction(async (tx) => {
    for (const videoId of toAssign) {
      const [assignment] = await tx
        .insert(assignments)
        .values({
          videoId,
          pairId: pair.id,
          waveNo: 0,
          dataset: "training",
          batchLabel: "training-pack",
          assignedBy: actorId,
        })
        .returning({ id: assignments.id });
      await tx.insert(assignmentRaters).values({
        assignmentId: assignment.id,
        userId,
        fillsContextCard: true,
      });
    }
  });
  await audit(actorId, "training_pack_assigned", userId, {
    email: target.email,
    assigned: toAssign.length,
  });
  return { ok: true, assigned: toAssign.length, already: have.size };
}

/** Create a trainee account and hand them the pack in one motion. */
export async function addTrainee(
  actorId: string,
  email: string,
  name: string | null,
): Promise<{ ok: true; assigned: number } | { ok: false; error: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return { ok: false, error: "That does not look like an email address." };
  }
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, clean));
  if (existing) return { ok: false, error: "That email already has an account." };
  const [created] = await db
    .insert(users)
    .values({
      email: clean,
      name: name?.trim() || null,
      role: "coder",
      datasetScope: "training",
    })
    .returning({ id: users.id });
  await audit(actorId, "trainee_added", created.id, { email: clean });
  const pack = await assignTrainingPack(actorId, created.id);
  return pack.ok ? { ok: true, assigned: pack.assigned } : pack;
}

/* ------------------------------- progress ---------------------------- */

export interface TraineeProgressRow {
  userId: string;
  name: string | null;
  email: string;
  assigned: number;
  submitted: number;
  lastActivity: Date | null;
}

export async function listTraineesWithProgress(): Promise<TraineeProgressRow[]> {
  const trainees = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.datasetScope, "training"), eq(users.isActive, true), eq(users.role, "coder")))
    .orderBy(asc(users.email));
  const visible = trainees.filter((t) => !t.email.endsWith("@example.invalid"));
  const out: TraineeProgressRow[] = [];
  for (const t of visible) {
    const assigned = await db
      .select({ id: assignments.id })
      .from(assignments)
      .innerJoin(assignmentRaters, eq(assignmentRaters.assignmentId, assignments.id))
      .where(
        and(
          eq(assignmentRaters.userId, t.userId),
          eq(assignments.dataset, "training"),
          eq(assignments.batchLabel, "training-pack"),
        ),
      );
    const obs = await db
      .select({ status: observations.status, submittedAt: observations.submittedAt })
      .from(observations)
      .where(and(eq(observations.coderId, t.userId), eq(observations.dataset, "training")))
      .orderBy(desc(observations.submittedAt));
    out.push({
      ...t,
      assigned: assigned.length,
      submitted: obs.filter((o) => o.status === "submitted").length,
      lastActivity: obs[0]?.submittedAt ?? null,
    });
  }
  return out;
}

/* --------------------- the gold-comparison dashboard ------------------ */

export interface TraineeStats {
  userId: string;
  label: string;
  itemsCompared: number;
  exact: number;
  adjacent: number;
  /** Quadratic-weighted agreement in [0,1]: 1 − (d/3)², averaged. */
  weighted: number;
  /** Mean signed deviation: positive = scores higher (toward B·Very). */
  meanSigned: number;
  /** A↔B column flips — disagreeing about the SIDE, the serious miss. */
  columnFlips: number;
}

export interface TrainingVideoMatrix {
  videoId: string;
  displayCode: string;
  items: Array<{
    itemNo: number;
    gold: number;
    byTrainee: Record<string, number | null>;
  }>;
}

export interface TrainingDashboard {
  trainees: Array<{ userId: string; label: string }>;
  videos: TrainingVideoMatrix[];
  stats: TraineeStats[];
}

export async function getTrainingDashboard(): Promise<TrainingDashboard> {
  const traineeRows = await listTraineesWithProgress();
  const trainees = traineeRows.map((t) => ({
    userId: t.userId,
    label: t.name ?? t.email.split("@")[0],
  }));

  const gold = await db
    .select({
      videoId: goldScores.videoId,
      itemNo: goldScores.itemNo,
      scoreNum: goldScores.scoreNum,
      displayCode: videos.displayCode,
    })
    .from(goldScores)
    .innerJoin(videos, eq(videos.id, goldScores.videoId))
    .where(eq(videos.isGold, true))
    .orderBy(asc(videos.displayCode), asc(goldScores.itemNo));
  const goldVideoIds = [...new Set(gold.map((g) => g.videoId))];

  // Every trainee score on gold videos, in one sweep.
  const traineeIds = trainees.map((t) => t.userId);
  const scoreByKey = new Map<string, number>(); // `${userId}#${videoId}#${itemNo}`
  if (traineeIds.length > 0 && goldVideoIds.length > 0) {
    const obs = await db
      .select({ id: observations.id, coderId: observations.coderId, videoId: observations.videoId })
      .from(observations)
      .where(
        and(
          inArray(observations.coderId, traineeIds),
          inArray(observations.videoId, goldVideoIds),
          eq(observations.status, "submitted"),
        ),
      );
    if (obs.length > 0) {
      const scoreRows = await db
        .select({ observationId: scores.observationId, itemNo: scores.itemNo, scoreNum: scores.scoreNum })
        .from(scores)
        .where(inArray(scores.observationId, obs.map((o) => o.id)));
      const obsById = new Map(obs.map((o) => [o.id, o]));
      for (const s of scoreRows) {
        const o = obsById.get(s.observationId)!;
        scoreByKey.set(`${o.coderId}#${o.videoId}#${s.itemNo}`, s.scoreNum);
      }
    }
  }

  const videosOut: TrainingVideoMatrix[] = [];
  for (const videoId of goldVideoIds) {
    const items = gold
      .filter((g) => g.videoId === videoId)
      .map((g) => ({
        itemNo: g.itemNo,
        gold: g.scoreNum,
        byTrainee: Object.fromEntries(
          trainees.map((t) => [
            t.userId,
            scoreByKey.get(`${t.userId}#${videoId}#${g.itemNo}`) ?? null,
          ]),
        ),
      }));
    videosOut.push({
      videoId,
      displayCode: gold.find((g) => g.videoId === videoId)!.displayCode,
      items,
    });
  }

  const stats: TraineeStats[] = trainees.map((t) => {
    let n = 0, exact = 0, adjacent = 0, weighted = 0, signed = 0, flips = 0;
    for (const v of videosOut) {
      for (const item of v.items) {
        const mine = item.byTrainee[t.userId];
        if (mine == null) continue;
        n++;
        const d = mine - item.gold;
        if (d === 0) exact++;
        if (Math.abs(d) <= 1) adjacent++;
        weighted += 1 - Math.pow(Math.abs(d) / 3, 2);
        signed += d;
        // Columns: 1–2 = A, 3–4 = B.
        if ((mine <= 2) !== (item.gold <= 2)) flips++;
      }
    }
    return {
      userId: t.userId,
      label: t.label,
      itemsCompared: n,
      exact,
      adjacent,
      weighted: n ? weighted / n : 0,
      meanSigned: n ? signed / n : 0,
      columnFlips: flips,
    };
  });

  return { trainees, videos: videosOut, stats };
}

/* --------------------------- response viewer -------------------------- */

export interface TraineeVideoWork {
  videoId: string;
  displayCode: string;
  status: string;
  submittedAt: Date | null;
  noteHtml: string | null;
  scores: Array<{
    itemNo: number;
    scoreNum: number;
    justification: string | null;
    gold: number | null;
  }>;
}

export async function getTraineeWork(userId: string): Promise<{
  trainee: { name: string | null; email: string } | null;
  work: TraineeVideoWork[];
}> {
  const [trainee] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (!trainee) return { trainee: null, work: [] };

  const obs = await db
    .select({
      id: observations.id,
      videoId: observations.videoId,
      status: observations.status,
      submittedAt: observations.submittedAt,
      displayCode: videos.displayCode,
    })
    .from(observations)
    .innerJoin(videos, eq(videos.id, observations.videoId))
    .where(and(eq(observations.coderId, userId), eq(observations.dataset, "training")))
    .orderBy(asc(videos.displayCode));

  const work: TraineeVideoWork[] = [];
  for (const o of obs) {
    const scoreRows = await db
      .select({ itemNo: scores.itemNo, scoreNum: scores.scoreNum, justification: scores.justification })
      .from(scores)
      .where(eq(scores.observationId, o.id))
      .orderBy(asc(scores.itemNo));
    const goldRows = await db
      .select({ itemNo: goldScores.itemNo, scoreNum: goldScores.scoreNum })
      .from(goldScores)
      .where(eq(goldScores.videoId, o.videoId));
    const goldBy = new Map(goldRows.map((g) => [g.itemNo, g.scoreNum]));
    const noteRows = await db
      .select({ body: notes.body })
      .from(notes)
      .where(eq(notes.observationId, o.id))
      .limit(1);
    work.push({
      videoId: o.videoId,
      displayCode: o.displayCode,
      status: o.status,
      submittedAt: o.submittedAt,
      noteHtml: noteRows[0]?.body ?? null,
      scores: scoreRows.map((s) => ({ ...s, gold: goldBy.get(s.itemNo) ?? null })),
    });
  }
  return { trainee, work };
}
