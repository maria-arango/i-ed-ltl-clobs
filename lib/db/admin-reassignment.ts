/**
 * REASSIGNMENT (admin layer, addendum §6 + CLAUDE.md §7): move a pair's
 * work when someone leaves, changes pace, or a pair must be dissolved.
 *
 * The rules, previewed per video BEFORE anything is written:
 *   untouched      nobody started → returned to the pool, or dealt to the
 *                  destination pair as a fresh assignment
 *   in progress    notes / draft scores / draft card exist, nothing
 *                  submitted → transferred to the destination pair; the
 *                  staying coder keeps their observation, the departing
 *                  coder's draft stays on record (rater row 'transferred')
 *   one submitted  a coder's scores are locked → transferred only when the
 *                  admin ticks "include submitted"; the departing coder's
 *                  submission is preserved as evidence and their seat is
 *                  marked 'voided' with the reason (never deleted)
 *   both submitted held: the pair must finish (or an admin void) the
 *                  calibration; moving would orphan two locked scores
 *   completed      never touched
 *
 * Cards (Amendment §43): every coder fills their own, so a departing
 * coder's card (draft or submitted) simply stays on record and the incoming
 * coder writes theirs. Every step lands in assignment_log with its reason;
 * the confirm re-runs the same classification and refuses if anything
 * changed (hash guard).
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentLog,
  assignmentRaters,
  assignments,
  auditLog,
  calibrationSessions,
  contextCards,
  notes,
  observations,
  pairMembers,
  pairs,
  scores,
  users,
  videos,
} from "@/db/schema";

export type MoveState = "untouched" | "in_progress" | "one_submitted" | "both_submitted";
export type MoveAction = "return_to_pool" | "transfer" | "hold";
type Seat = "anchor" | "enumerator";

export interface MovePlanRow {
  assignmentId: string;
  videoId: string;
  displayCode: string;
  state: MoveState;
  action: MoveAction;
  /** Plain-language consequence shown in the preview. */
  note: string;
  /** Each seat's own context card (Amendment §43). */
  cards: Record<Seat, "none" | "draft" | "submitted">;
  /** Seats whose CURRENT holder has submitted scores. */
  submittedSeats: Seat[];
}

export interface SeatPeople {
  from: { id: string; label: string };
  to: { id: string; label: string } | null;
}

export interface MovePreview {
  fromPairId: string;
  toPairId: string | null;
  includeSubmitted: boolean;
  hash: string;
  seats: Record<Seat, SeatPeople>;
  rows: MovePlanRow[];
  counts: Record<MoveAction, number>;
}

export interface MoveInput {
  fromPairId: string;
  toPairId: string | null;
  includeSubmitted: boolean;
}

/* ------------------------------ helpers ------------------------------ */

async function pairSeats(pairId: string): Promise<Record<Seat, { id: string; label: string }> | null> {
  const rows = await db
    .select({
      userId: pairMembers.userId,
      name: users.name,
      email: users.email,
      role: users.role,
      isChiefCoder: users.isChiefCoder,
      dissolvedAt: pairs.dissolvedAt,
      dataset: pairs.dataset,
    })
    .from(pairMembers)
    .innerJoin(users, eq(users.id, pairMembers.userId))
    .innerJoin(pairs, eq(pairs.id, pairMembers.pairId))
    .where(and(eq(pairMembers.pairId, pairId), isNull(pairMembers.leftAt)));
  if (rows.length !== 2) return null;
  const anchor = rows.find((r) => r.role === "admin" || r.isChiefCoder);
  const enumerator = rows.find((r) => r !== anchor);
  if (!anchor || !enumerator) return null;
  const label = (u: { name: string | null; email: string }) => u.name ?? u.email;
  return {
    anchor: { id: anchor.userId, label: label(anchor) },
    enumerator: { id: enumerator.userId, label: label(enumerator) },
  };
}

async function pairMeta(pairId: string) {
  const [p] = await db
    .select({ id: pairs.id, dataset: pairs.dataset, dissolvedAt: pairs.dissolvedAt, label: pairs.label })
    .from(pairs)
    .where(eq(pairs.id, pairId))
    .limit(1);
  return p ?? null;
}

function hashPlan(input: MoveInput, rows: MovePlanRow[]): string {
  const h = createHash("sha256");
  h.update(`${input.fromPairId}>${input.toPairId ?? "pool"}#${input.includeSubmitted ? 1 : 0}`);
  h.update(
    rows
      .map((r) => `${r.assignmentId}:${r.state}:${r.cards.anchor}:${r.cards.enumerator}:${r.submittedSeats.join("+")}`)
      .sort()
      .join(","),
  );
  return h.digest("hex").slice(0, 16);
}

/* ------------------------------ classify ------------------------------ */

async function classify(input: MoveInput): Promise<
  | { ok: true; preview: MovePreview; raterRows: RaterRow[] }
  | { ok: false; error: string }
> {
  if (input.toPairId === input.fromPairId) {
    return { ok: false, error: "Choose a different destination pair." };
  }
  const fromMeta = await pairMeta(input.fromPairId);
  if (!fromMeta) return { ok: false, error: "That pair no longer exists." };
  const fromSeats = await pairSeats(input.fromPairId);
  if (!fromSeats) return { ok: false, error: "The source pair is malformed (needs one anchor and one enumerator)." };

  let toSeats: Record<Seat, { id: string; label: string }> | null = null;
  if (input.toPairId) {
    const toMeta = await pairMeta(input.toPairId);
    if (!toMeta || toMeta.dissolvedAt) return { ok: false, error: "The destination pair must be an active pair." };
    if (toMeta.dataset !== fromMeta.dataset) return { ok: false, error: "Both pairs must be in the same dataset." };
    toSeats = await pairSeats(input.toPairId);
    if (!toSeats) return { ok: false, error: "The destination pair is malformed." };
  }

  const active = await db
    .select({
      assignmentId: assignments.id,
      videoId: assignments.videoId,
      displayCode: videos.displayCode,
    })
    .from(assignments)
    .innerJoin(videos, eq(videos.id, assignments.videoId))
    .where(and(eq(assignments.pairId, input.fromPairId), eq(assignments.status, "active")))
    .orderBy(asc(videos.displayCode));

  const seats: Record<Seat, SeatPeople> = {
    anchor: { from: fromSeats.anchor, to: toSeats?.anchor ?? null },
    enumerator: { from: fromSeats.enumerator, to: toSeats?.enumerator ?? null },
  };
  if (active.length === 0) {
    return {
      ok: true,
      raterRows: [],
      preview: {
        ...input,
        hash: hashPlan(input, []),
        seats,
        rows: [],
        counts: { return_to_pool: 0, transfer: 0, hold: 0 },
      },
    };
  }

  const assignmentIds = active.map((a) => a.assignmentId);
  const videoIds = active.map((a) => a.videoId);
  const memberIds = [fromSeats.anchor.id, fromSeats.enumerator.id];

  const raterRows = await db
    .select({
      id: assignmentRaters.id,
      assignmentId: assignmentRaters.assignmentId,
      userId: assignmentRaters.userId,
      fillsContextCard: assignmentRaters.fillsContextCard,
      previouslyCoded: assignmentRaters.previouslyCoded,
      status: assignmentRaters.status,
    })
    .from(assignmentRaters)
    .where(and(inArray(assignmentRaters.assignmentId, assignmentIds), eq(assignmentRaters.status, "active")));

  const obs = await db
    .select({ id: observations.id, videoId: observations.videoId, coderId: observations.coderId, status: observations.status })
    .from(observations)
    .where(and(inArray(observations.videoId, videoIds), inArray(observations.coderId, memberIds)));
  const obsIds = obs.map((o) => o.id);
  const noteRows = obsIds.length
    ? await db
        .select({ observationId: notes.observationId })
        .from(notes)
        .where(and(inArray(notes.observationId, obsIds), isNull(notes.deletedAt)))
    : [];
  const scoreRows = obsIds.length
    ? await db.select({ observationId: scores.observationId }).from(scores).where(inArray(scores.observationId, obsIds))
    : [];
  const cards = await db
    .select({ videoId: contextCards.videoId, status: contextCards.status, authoredBy: contextCards.authoredBy })
    .from(contextCards)
    .where(inArray(contextCards.videoId, videoIds));
  const sessions = await db
    .select({ videoId: calibrationSessions.videoId, status: calibrationSessions.status })
    .from(calibrationSessions)
    .where(
      and(
        inArray(calibrationSessions.videoId, videoIds),
        eq(calibrationSessions.pairId, input.fromPairId),
        ne(calibrationSessions.status, "voided"),
      ),
    );

  const hasContent = (obsId: string) =>
    noteRows.some((n) => n.observationId === obsId) || scoreRows.some((s) => s.observationId === obsId);

  const rows: MovePlanRow[] = active.map((a) => {
    const seatOf = (userId: string): Seat => (userId === fromSeats.anchor.id ? "anchor" : "enumerator");
    const cardOf = (seat: Seat): "none" | "draft" | "submitted" =>
      cards.find((c) => c.videoId === a.videoId && c.authoredBy === seats[seat].from.id)?.status ?? "none";
    const cardsBySeat = { anchor: cardOf("anchor"), enumerator: cardOf("enumerator") };
    const anyCard = cards.some((c) => c.videoId === a.videoId);
    const submittedSeats: Seat[] = obs
      .filter((o) => o.videoId === a.videoId && o.status === "submitted")
      .map((o) => seatOf(o.coderId));
    const anyWork =
      obs.some((o) => o.videoId === a.videoId && (o.status !== "not_started" || hasContent(o.id))) || anyCard;
    const session = sessions.find((s) => s.videoId === a.videoId);

    const state: MoveState =
      submittedSeats.length >= 2 || session
        ? "both_submitted"
        : submittedSeats.length === 1
          ? "one_submitted"
          : anyWork
            ? "in_progress"
            : "untouched";

    const departing = (seat: Seat) => seats[seat].to === null || seats[seat].to!.id !== seats[seat].from.id;
    const who = (seat: Seat) => seats[seat].from.label;

    let action: MoveAction;
    let note: string;
    if (state === "both_submitted") {
      action = "hold";
      note = session
        ? "Both coders have submitted and a calibration exists. Finish it with this pair (or void the session) before moving."
        : "Both coders have submitted. The pair should calibrate this one; it stays.";
    } else if (!input.toPairId) {
      if (state === "untouched") {
        action = "return_to_pool";
        note = "Nobody has started. Returns to the pool for a future wave.";
      } else {
        action = "hold";
        note = "Work exists. Choose a destination pair to move it; nothing is discarded.";
      }
    } else if (state === "one_submitted") {
      const seat = submittedSeats[0];
      if (!departing(seat)) {
        action = "transfer";
        note = `${who(seat)} keeps their submitted scores; the other seat is refilled.`;
      } else if (input.includeSubmitted) {
        action = "transfer";
        note = `${who(seat)}'s submitted scores stay on record (seat marked voided, reason logged); both seats are refilled and the video is coded again by the new pair.`;
      } else {
        action = "hold";
        note = `${who(seat)} already submitted scores. Tick "include submitted" to move it anyway (their scores are kept as evidence).`;
      }
    } else {
      action = "transfer";
      const parts: string[] = [];
      for (const seat of ["anchor", "enumerator"] as Seat[]) {
        const o = obs.find((x) => x.videoId === a.videoId && x.coderId === seats[seat].from.id);
        const worked = o && (o.status !== "not_started" || hasContent(o.id));
        const cardWord = cardsBySeat[seat] === "submitted" ? "submitted card" : cardsBySeat[seat] === "draft" ? "draft card" : null;
        if (departing(seat) && (worked || cardWord)) {
          parts.push(`${who(seat)}'s ${[worked ? "draft" : null, cardWord].filter(Boolean).join(" and ")} stays on record; ${seats[seat].to!.label} writes their own card`);
        }
        if (!departing(seat)) parts.push(`${who(seat)} keeps their work`);
      }
      note = state === "untouched" ? `Nobody has started. ${parts.length ? parts.join("; ") + "." : "Dealt to the new pair as is."}` : `${parts.join("; ")}.`;
    }

    return {
      assignmentId: a.assignmentId,
      videoId: a.videoId,
      displayCode: a.displayCode,
      state,
      action,
      note,
      cards: cardsBySeat,
      submittedSeats,
    };
  });

  const counts: Record<MoveAction, number> = { return_to_pool: 0, transfer: 0, hold: 0 };
  for (const r of rows) counts[r.action]++;

  return {
    ok: true,
    raterRows,
    preview: { ...input, hash: hashPlan(input, rows), seats, rows, counts },
  };
}

type RaterRow = {
  id: string;
  assignmentId: string;
  userId: string;
  fillsContextCard: boolean;
  previouslyCoded: boolean;
  status: "active" | "transferred" | "voided";
};

/* ------------------------------- public ------------------------------- */

export async function previewMove(
  input: MoveInput,
): Promise<{ ok: true; preview: MovePreview } | { ok: false; error: string }> {
  const r = await classify(input);
  if (!r.ok) return r;
  return { ok: true, preview: r.preview };
}

export interface MoveResult {
  transferred: number;
  returned: number;
  held: number;
}

export async function confirmMove(
  actorId: string,
  input: MoveInput & { reason: string; expectedHash: string },
): Promise<{ ok: true; result: MoveResult } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: "A reason is required; it is written into the assignment log." };
  const r = await classify(input);
  if (!r.ok) return r;
  const { preview, raterRows } = r;
  if (preview.hash !== input.expectedHash) {
    return { ok: false, error: "The work changed since this preview. Preview again before confirming." };
  }
  if (preview.counts.transfer + preview.counts.return_to_pool === 0) {
    return { ok: false, error: "Nothing to do: every video is held." };
  }

  const fromPairId = preview.fromPairId;
  const toPairId = preview.toPairId;
  const seats = preview.seats;
  const [fromAssn] = await db
    .select({ dataset: assignments.dataset })
    .from(assignments)
    .where(eq(assignments.pairId, fromPairId))
    .limit(1);
  const dataset = fromAssn?.dataset ?? "live";

  await db.transaction(async (tx) => {
    for (const row of preview.rows) {
      if (row.action === "hold") continue;
      const [assn] = await tx
        .select({
          id: assignments.id,
          waveNo: assignments.waveNo,
          priorityBatchFlag: assignments.priorityBatchFlag,
          batchLabel: assignments.batchLabel,
        })
        .from(assignments)
        .where(eq(assignments.id, row.assignmentId));

      if (row.action === "return_to_pool") {
        await tx
          .update(assignments)
          .set({ status: "returned", statusReason: `Returned to the pool: ${reason}` })
          .where(eq(assignments.id, row.assignmentId));
        await tx.update(videos).set({ status: "pool" }).where(eq(videos.id, row.videoId));
        await tx.insert(assignmentLog).values({
          action: "return_to_pool",
          videoId: row.videoId,
          fromPairId,
          waveNo: assn.waveNo,
          reason,
          actorId,
          dataset,
        });
        continue;
      }

      // transfer
      const [created] = await tx
        .insert(assignments)
        .values({
          videoId: row.videoId,
          pairId: toPairId!,
          waveNo: assn.waveNo,
          dataset,
          priorityBatchFlag: assn.priorityBatchFlag,
          batchLabel: assn.batchLabel,
          status: "active",
          statusReason: `Moved from another pair: ${reason}`,
          assignedBy: actorId,
        })
        .returning({ id: assignments.id });

      for (const seat of ["anchor", "enumerator"] as Seat[]) {
        const fromUser = seats[seat].from;
        const toUser = seats[seat].to!;
        const oldRow = raterRows.find((x) => x.assignmentId === row.assignmentId && x.userId === fromUser.id);
        const samePerson = fromUser.id === toUser.id;
        const submitted = row.submittedSeats.includes(seat);

        if (oldRow) {
          const voided = submitted && !samePerson;
          await tx
            .update(assignmentRaters)
            .set({
              status: voided ? "voided" : "transferred",
              statusReason: voided
                ? `Submitted scores kept as evidence; seat refilled by ${toUser.label}: ${reason}`
                : samePerson
                  ? `Carried to the new pair: ${reason}`
                  : `Seat passed to ${toUser.label}: ${reason}`,
            })
            .where(eq(assignmentRaters.id, oldRow.id));
          if (voided) {
            await tx.insert(assignmentLog).values({
              action: "void",
              videoId: row.videoId,
              fromPairId,
              fromUserId: fromUser.id,
              waveNo: assn.waveNo,
              reason: `Submitted scores preserved; seat refilled: ${reason}`,
              actorId,
              dataset,
            });
          }
        }

        // Amendment §43: every seat fills its own card.
        const fills = true;
        const [newRow] = await tx
          .insert(assignmentRaters)
          .values({
            assignmentId: created.id,
            userId: toUser.id,
            fillsContextCard: fills,
            previouslyCoded: samePerson ? (oldRow?.previouslyCoded ?? false) : false,
          })
          .returning({ id: assignmentRaters.id });

        // The staying coder's observation follows them to the new seat.
        if (samePerson) {
          await tx
            .update(observations)
            .set({ assignmentRaterId: newRow.id })
            .where(and(eq(observations.videoId, row.videoId), eq(observations.coderId, toUser.id)));
        }

        await tx.insert(assignmentLog).values({
          action: "reassign",
          videoId: row.videoId,
          fromPairId,
          toPairId,
          fromUserId: fromUser.id,
          toUserId: toUser.id,
          fillsContextCard: fills,
          waveNo: assn.waveNo,
          reason,
          actorId,
          dataset,
        });
      }

      await tx
        .update(assignments)
        .set({ status: "returned", statusReason: `Moved to another pair: ${reason}` })
        .where(eq(assignments.id, row.assignmentId));
    }

    await tx.insert(auditLog).values({
      actorId,
      action: "work_moved",
      subjectTable: "assignments",
      subjectId: fromPairId,
      details: {
        fromPairId,
        toPairId,
        includeSubmitted: preview.includeSubmitted,
        reason,
        counts: preview.counts,
        videos: preview.rows.filter((x) => x.action !== "hold").map((x) => x.displayCode),
      },
    });
  });

  return {
    ok: true,
    result: {
      transferred: preview.counts.transfer,
      returned: preview.counts.return_to_pool,
      held: preview.counts.hold,
    },
  };
}
