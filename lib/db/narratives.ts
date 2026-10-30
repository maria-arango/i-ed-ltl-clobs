/**
 * ENUMERATOR query layer for the Narratives workspace (Amendments §51–§52,
 * ADR 0002). Like lib/db/coder.ts it connects as the restricted role
 * `clobs_coder`, which has no grant on narratives.lesson_id,
 * narratives.source_text or the assignment's video_file. Every function is
 * scoped to the acting enumerator: another person's assignment is
 * indistinguishable from one that does not exist.
 *
 * Enumerators know each narrative as "Video <order>" ("Practice" for a
 * practice narrative), never by its admin label or N-code (Amendment §61).
 * The lesson id stays inside the narrative's own text, on purpose, so they
 * can check it against the video they open.
 *
 * Saving is optimistic: a save names the revision it was built on and is
 * applied only if that is still the current revision. A refused save is
 * kept as a `conflict_copy` revision, so nothing a device sends is lost.
 */
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  narrativeAssignments,
  narrativeDocuments,
  narrativeRevisions,
  narratives,
  narrativeSittings,
  narrativeTemplates,
  users,
} from "@/db/schema";
import { coderDb as db } from "@/lib/db/coder";
import type { DeviceKind } from "@/lib/device";
import {
  ANSWER_KEYS,
  docStats,
  type NarrativeAnswers,
  type NarrativeComment,
  type PMNode,
} from "@/lib/narratives/doc";
import { validateNarrativeDoc } from "@/lib/narratives/editor-schema";
import type { NarrativeTemplate } from "@/lib/narratives/template";

export type NarrativeStatus = "not_started" | "in_progress" | "submitted" | "returned";

export class NarrativeError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ */
/* The list                                                            */
/* ------------------------------------------------------------------ */

export interface MyNarrativeRow {
  assignmentId: string;
  orderNo: number;
  /** "Video 3", or "Practice". */
  label: string;
  practice: boolean;
  durationLabel: string | null;
  status: NarrativeStatus;
  videoUrl: string | null;
  updatedAt: Date | null;
  submittedAt: Date | null;
}

/** What an enumerator calls a narrative (Amendment §61). */
export function enumeratorLabel(orderNo: number, dataset: string): string {
  return dataset === "training" ? "Practice" : `Video ${orderNo}`;
}

/** The enumerator's open assignments: practice first, then in the order to do them. */
export async function listMyNarratives(userId: string): Promise<MyNarrativeRow[]> {
  const rows = await db
    .select({
      assignmentId: narrativeAssignments.id,
      orderNo: narrativeAssignments.orderNo,
      dataset: narrativeAssignments.dataset,
      durationLabel: narratives.durationLabel,
      status: narrativeAssignments.status,
      videoUrl: narrativeAssignments.videoUrl,
      updatedAt: narrativeDocuments.updatedAt,
      submittedAt: narrativeAssignments.submittedAt,
    })
    .from(narrativeAssignments)
    .innerJoin(narratives, eq(narratives.id, narrativeAssignments.narrativeId))
    .leftJoin(narrativeDocuments, eq(narrativeDocuments.assignmentId, narrativeAssignments.id))
    .where(
      and(
        eq(narrativeAssignments.assigneeId, userId),
        ne(narrativeAssignments.status, "returned"),
        isNull(narratives.voidedAt),
      ),
    )
    .orderBy(asc(narrativeAssignments.orderNo), asc(narrativeAssignments.assignedAt));
  return rows
    .map(({ dataset, ...r }) => ({ ...r, label: enumeratorLabel(r.orderNo, dataset), practice: dataset === "training" }))
    .sort((a, b) => Number(b.practice) - Number(a.practice));
}

/**
 * Does this person have any open narrative? An admin with one (a practice
 * narrative, say) sees "My narratives" without joining the team.
 */
export async function hasOpenNarratives(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: narrativeAssignments.id })
    .from(narrativeAssignments)
    .where(and(eq(narrativeAssignments.assigneeId, userId), ne(narrativeAssignments.status, "returned")))
    .limit(1);
  return !!row;
}

/* ------------------------------------------------------------------ */
/* One narrative                                                       */
/* ------------------------------------------------------------------ */

export interface MyNarrative {
  assignmentId: string;
  orderNo: number;
  /** "Video 3", or "Practice". */
  label: string;
  practice: boolean;
  durationLabel: string | null;
  status: NarrativeStatus;
  videoUrl: string | null;
  revision: number;
  doc: PMNode;
  answers: NarrativeAnswers;
  comments: NarrativeComment[];
  updatedAt: Date;
  template: NarrativeTemplate | null;
  readOnly: boolean;
}

async function ownAssignment(userId: string, assignmentId: string) {
  const [row] = await db
    .select({
      id: narrativeAssignments.id,
      status: narrativeAssignments.status,
      orderNo: narrativeAssignments.orderNo,
      videoUrl: narrativeAssignments.videoUrl,
      templateId: narrativeAssignments.templateId,
      dataset: narrativeAssignments.dataset,
      narrativeId: narrativeAssignments.narrativeId,
      startedAt: narrativeAssignments.startedAt,
      durationLabel: narratives.durationLabel,
      initialDoc: narratives.initialDoc,
    })
    .from(narrativeAssignments)
    .innerJoin(narratives, eq(narratives.id, narrativeAssignments.narrativeId))
    .where(
      and(
        eq(narrativeAssignments.id, assignmentId),
        eq(narrativeAssignments.assigneeId, userId),
        ne(narrativeAssignments.status, "returned"),
        isNull(narratives.voidedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getMyNarrative(userId: string, assignmentId: string): Promise<MyNarrative | null> {
  const a = await ownAssignment(userId, assignmentId);
  if (!a) return null;
  const [d] = await db
    .select()
    .from(narrativeDocuments)
    .where(eq(narrativeDocuments.assignmentId, assignmentId))
    .limit(1);
  if (!d) return null;
  let template: NarrativeTemplate | null = null;
  if (a.templateId) {
    const [t] = await db
      .select({ content: narrativeTemplates.content })
      .from(narrativeTemplates)
      .where(eq(narrativeTemplates.id, a.templateId))
      .limit(1);
    template = (t?.content as NarrativeTemplate) ?? null;
  }
  return {
    assignmentId: a.id,
    orderNo: a.orderNo,
    label: enumeratorLabel(a.orderNo, a.dataset),
    practice: a.dataset === "training",
    durationLabel: a.durationLabel,
    status: a.status,
    videoUrl: a.videoUrl,
    revision: d.revision,
    doc: d.doc as PMNode,
    answers: (d.answers ?? {}) as NarrativeAnswers,
    comments: (d.comments ?? []) as NarrativeComment[],
    updatedAt: d.updatedAt,
    template,
    readOnly: a.status === "submitted",
  };
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

export interface SavePayload {
  baseRevision: number;
  clientId: string;
  doc: unknown;
  answers: unknown;
  comments: unknown;
}

export type SaveResult =
  | { ok: true; revision: number; savedAt: string }
  | { ok: false; reason: "conflict"; serverRevision: number }
  | { ok: false; reason: "submitted" }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid"; error: string };

const MAX_ANSWER = 20_000;
const MAX_COMMENT = 5_000;
const MAX_COMMENTS = 2_000;

function cleanAnswers(raw: unknown): NarrativeAnswers | string {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return "answers must be an object";
  const out: NarrativeAnswers = {};
  for (const k of ANSWER_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return `answer ${k} must be text`;
    if (v.length > MAX_ANSWER) return `answer ${k} is too long`;
    out[k] = v;
  }
  return out;
}

/**
 * Comments are attributed by the SERVER: a new comment gets the acting
 * person as author whatever the client claims, and an existing comment
 * keeps its stored author (and body, unless it is the actor's own).
 */
function cleanComments(
  raw: unknown,
  stored: NarrativeComment[],
  actor: { id: string; name: string },
): NarrativeComment[] | string {
  if (!Array.isArray(raw)) return "comments must be a list";
  if (raw.length > MAX_COMMENTS) return "too many comments";
  const byId = new Map(stored.map((c) => [c.id, c]));
  const out: NarrativeComment[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();
  for (const c of raw) {
    if (!c || typeof c !== "object") return "invalid comment";
    const { id, body } = c as Record<string, unknown>;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) return "invalid comment id";
    if (typeof body !== "string" || body.length > MAX_COMMENT) return "invalid comment text";
    if (seen.has(id)) return "duplicate comment id";
    seen.add(id);
    const prev = byId.get(id);
    if (prev) {
      const mine = prev.authorId === actor.id;
      const changed = mine && prev.body !== body;
      out.push({ ...prev, body: mine ? body : prev.body, updatedAt: changed ? now : prev.updatedAt });
    } else {
      out.push({ id, body, authorId: actor.id, authorName: actor.name, createdAt: now, updatedAt: now });
    }
  }
  return out;
}

const SNAPSHOT_EVERY_MS = 3 * 60 * 1000;

/** Should this save also become a version-history snapshot? */
export function needsSnapshot(opts: {
  lastSnapshotAt: Date | null;
  now: Date;
  prevChars: number;
  nextChars: number;
  prevComments: number;
  nextComments: number;
}): boolean {
  if (!opts.lastSnapshotAt) return true;
  if (opts.now.getTime() - opts.lastSnapshotAt.getTime() >= SNAPSHOT_EVERY_MS) return true;
  const drop = opts.prevChars - opts.nextChars;
  if (drop > 200 || (opts.prevChars > 0 && drop / opts.prevChars > 0.02)) return true;
  if (opts.nextComments < opts.prevComments) return true;
  return false;
}

export async function saveMyNarrative(
  actor: { id: string; name: string },
  assignmentId: string,
  p: SavePayload,
): Promise<SaveResult> {
  const a = await ownAssignment(actor.id, assignmentId);
  if (!a) return { ok: false, reason: "not_found" };
  if (!Number.isInteger(p.baseRevision) || p.baseRevision < 0) {
    return { ok: false, reason: "invalid", error: "baseRevision must be a whole number" };
  }
  if (typeof p.clientId !== "string" || p.clientId.length > 100) {
    return { ok: false, reason: "invalid", error: "clientId is required" };
  }
  const v = validateNarrativeDoc(p.doc);
  if (!v.ok) return { ok: false, reason: "invalid", error: `document: ${v.error}` };
  const answers = cleanAnswers(p.answers);
  if (typeof answers === "string") return { ok: false, reason: "invalid", error: answers };

  return db.transaction(async (tx) => {
    // Lock the working copy so two saves cannot interleave.
    const [cur] = await tx
      .select()
      .from(narrativeDocuments)
      .where(eq(narrativeDocuments.assignmentId, assignmentId))
      .for("update")
      .limit(1);
    if (!cur) return { ok: false as const, reason: "not_found" as const };
    const comments = cleanComments(p.comments, (cur.comments ?? []) as NarrativeComment[], actor);
    if (typeof comments === "string") return { ok: false as const, reason: "invalid" as const, error: comments };

    const [st] = await tx
      .select({ status: narrativeAssignments.status })
      .from(narrativeAssignments)
      .where(eq(narrativeAssignments.id, assignmentId))
      .limit(1);
    const doc = p.doc as PMNode;
    const stats = docStats(doc, comments, a.initialDoc as PMNode);

    if (st?.status === "submitted") {
      await tx.insert(narrativeRevisions).values({
        assignmentId,
        revision: p.baseRevision,
        kind: "conflict_copy",
        doc,
        answers,
        comments,
        stats: { ...stats, refused: "submitted" },
        createdBy: actor.id,
        clientId: p.clientId,
        dataset: a.dataset,
      });
      return { ok: false as const, reason: "submitted" as const };
    }

    if (cur.revision !== p.baseRevision) {
      // Never overwrite silently: keep what this device sent, refuse it.
      await tx.insert(narrativeRevisions).values({
        assignmentId,
        revision: p.baseRevision,
        kind: "conflict_copy",
        doc,
        answers,
        comments,
        stats: { ...stats, refused: "stale", serverRevision: cur.revision },
        createdBy: actor.id,
        clientId: p.clientId,
        dataset: a.dataset,
      });
      return { ok: false as const, reason: "conflict" as const, serverRevision: cur.revision };
    }

    const now = new Date();
    const prevDoc = cur.doc as PMNode;
    const prevComments = (cur.comments ?? []) as NarrativeComment[];
    const prevStats = docStats(prevDoc, prevComments);

    // A different device/tab taking over: keep the state it replaces.
    if (cur.updatedByClient && cur.updatedByClient !== p.clientId && cur.revision > 0) {
      await tx.insert(narrativeRevisions).values({
        assignmentId,
        revision: cur.revision,
        kind: "snapshot",
        doc: prevDoc,
        answers: cur.answers,
        comments: prevComments,
        stats: { ...prevStats, reason: "before_device_change" },
        createdBy: actor.id,
        clientId: cur.updatedByClient,
        dataset: a.dataset,
      });
    }

    const nextRevision = cur.revision + 1;
    await tx
      .update(narrativeDocuments)
      .set({
        revision: nextRevision,
        doc,
        answers,
        comments,
        updatedAt: now,
        updatedByClient: p.clientId,
      })
      .where(eq(narrativeDocuments.assignmentId, assignmentId));

    if (st?.status === "not_started") {
      await tx
        .update(narrativeAssignments)
        .set({ status: "in_progress", startedAt: a.startedAt ?? now })
        .where(eq(narrativeAssignments.id, assignmentId));
    }

    const [last] = await tx
      .select({ createdAt: narrativeRevisions.createdAt })
      .from(narrativeRevisions)
      .where(
        and(
          eq(narrativeRevisions.assignmentId, assignmentId),
          inArray(narrativeRevisions.kind, ["snapshot", "import", "restore", "reopen"]),
        ),
      )
      .orderBy(desc(narrativeRevisions.createdAt))
      .limit(1);
    if (
      needsSnapshot({
        lastSnapshotAt: last?.createdAt ?? null,
        now,
        prevChars: prevStats.totalChars,
        nextChars: stats.totalChars,
        prevComments: prevComments.length,
        nextComments: comments.length,
      })
    ) {
      await tx.insert(narrativeRevisions).values({
        assignmentId,
        revision: nextRevision,
        kind: "snapshot",
        doc,
        answers,
        comments,
        stats,
        createdBy: actor.id,
        clientId: p.clientId,
        dataset: a.dataset,
      });
    }
    return { ok: true as const, revision: nextRevision, savedAt: now.toISOString() };
  });
}

/* ------------------------------------------------------------------ */
/* Submitting                                                          */
/* ------------------------------------------------------------------ */

export type SubmitResult =
  | { ok: true; submittedAt: string }
  | { ok: false; reason: "not_found" | "already_submitted" | "not_synced" };

/**
 * Submit exactly the revision the enumerator is looking at: if the device
 * still has unsaved changes (baseRevision is not current) the submit is
 * refused, so what is submitted is what they saw.
 */
export async function submitMyNarrative(
  actor: { id: string },
  assignmentId: string,
  baseRevision: number,
): Promise<SubmitResult> {
  const a = await ownAssignment(actor.id, assignmentId);
  if (!a) return { ok: false, reason: "not_found" };
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(narrativeDocuments)
      .where(eq(narrativeDocuments.assignmentId, assignmentId))
      .for("update")
      .limit(1);
    const [st] = await tx
      .select({ status: narrativeAssignments.status })
      .from(narrativeAssignments)
      .where(eq(narrativeAssignments.id, assignmentId))
      .limit(1);
    if (!cur || !st) return { ok: false as const, reason: "not_found" as const };
    if (st.status === "submitted") return { ok: false as const, reason: "already_submitted" as const };
    if (cur.revision !== baseRevision) return { ok: false as const, reason: "not_synced" as const };
    const now = new Date();
    const comments = (cur.comments ?? []) as NarrativeComment[];
    await tx.insert(narrativeRevisions).values({
      assignmentId,
      revision: cur.revision,
      kind: "submit",
      doc: cur.doc,
      answers: cur.answers,
      comments,
      stats: docStats(cur.doc as PMNode, comments, a.initialDoc as PMNode),
      createdBy: actor.id,
      clientId: cur.updatedByClient,
      dataset: a.dataset,
    });
    await tx
      .update(narrativeAssignments)
      .set({
        status: "submitted",
        submittedAt: now,
        submittedRevision: cur.revision,
        startedAt: a.startedAt ?? now,
      })
      .where(eq(narrativeAssignments.id, assignmentId));
    await tx
      .update(narrativeSittings)
      .set({ endedAt: now })
      .where(and(eq(narrativeSittings.assignmentId, assignmentId), isNull(narrativeSittings.endedAt)));
    return { ok: true as const, submittedAt: now.toISOString() };
  });
}

/* ------------------------------------------------------------------ */
/* Sittings (measured time)                                            */
/* ------------------------------------------------------------------ */

/** A heartbeat older than this means the sitting ended (tab closed, battery). */
export const SITTING_STALE_MS = 2 * 60 * 1000;

export async function touchSitting(
  actor: { id: string },
  assignmentId: string,
  opts: { device: DeviceKind; storagePersisted: boolean | null; end?: boolean },
): Promise<{ ok: boolean }> {
  const a = await ownAssignment(actor.id, assignmentId);
  if (!a || a.status === "submitted") return { ok: false };
  const now = new Date();
  const [open] = await db
    .select({ id: narrativeSittings.id, last: narrativeSittings.lastHeartbeatAt })
    .from(narrativeSittings)
    .where(
      and(
        eq(narrativeSittings.assignmentId, assignmentId),
        eq(narrativeSittings.userId, actor.id),
        isNull(narrativeSittings.endedAt),
      ),
    )
    .orderBy(desc(narrativeSittings.startedAt))
    .limit(1);
  const stale = open && now.getTime() - open.last.getTime() > SITTING_STALE_MS;
  if (open && stale) {
    // Close the abandoned sitting at its last sign of life.
    await db
      .update(narrativeSittings)
      .set({ endedAt: open.last })
      .where(eq(narrativeSittings.id, open.id));
  }
  if (opts.end) {
    if (open && !stale) {
      await db
        .update(narrativeSittings)
        .set({ endedAt: now, lastHeartbeatAt: now })
        .where(eq(narrativeSittings.id, open.id));
    }
    return { ok: true };
  }
  if (open && !stale) {
    await db
      .update(narrativeSittings)
      .set({ lastHeartbeatAt: now, storagePersisted: opts.storagePersisted })
      .where(eq(narrativeSittings.id, open.id));
  } else {
    await db.insert(narrativeSittings).values({
      assignmentId,
      userId: actor.id,
      device: opts.device,
      storagePersisted: opts.storagePersisted,
      dataset: a.dataset,
    });
  }
  return { ok: true };
}

/** The acting person's display name (comment authorship). */
export async function getDisplayName(userId: string): Promise<string> {
  const [u] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.name || u?.email || "Unknown";
}
