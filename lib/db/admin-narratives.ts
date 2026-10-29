/**
 * ADMIN layer for the Narratives workspace (Amendments §51–§54). Uses the
 * full admin client. Every change is audited and nothing is deleted:
 * reassignment marks the old assignment 'returned', reopening and
 * restoring write new revisions, voiding a narrative only sets voided_at.
 */
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, like, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  narrativeAssignments,
  narrativeDocuments,
  narrativeRevisions,
  narratives,
  narrativeSittings,
  narrativeTemplates,
  userTeams,
  users,
} from "@/db/schema";
import templateSeed from "@/db/seed/narrative-template-2026-10-21.json";
import { csvObjects, normaliseVideoLink } from "@/lib/narratives/csv";
import { docStats, type DocStats, type NarrativeAnswers, type NarrativeComment, type PMNode } from "@/lib/narratives/doc";
import { narrativeToDoc, parseNarrative, PARSER_VERSION, redactLessonId } from "@/lib/narratives/parse";
import type { NarrativeTemplate } from "@/lib/narratives/template";

type Dataset = "live" | "test" | "training";
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function audit(actorId: string | null, action: string, subjectTable: string, subjectId: string, details: Record<string, unknown>) {
  await db.insert(auditLog).values({ actorId, action, subjectTable, subjectId, details });
}

/* ------------------------------------------------------------------ */
/* Template                                                            */
/* ------------------------------------------------------------------ */

/** The current review template, created from the seed file on first use. */
export async function getActiveTemplate(): Promise<{ id: string; content: NarrativeTemplate }> {
  const seed = templateSeed as unknown as NarrativeTemplate;
  const [existing] = await db
    .select()
    .from(narrativeTemplates)
    .where(eq(narrativeTemplates.version, seed.version))
    .limit(1);
  if (existing) return { id: existing.id, content: existing.content as NarrativeTemplate };
  const [row] = await db
    .insert(narrativeTemplates)
    .values({ version: seed.version, content: seed })
    .onConflictDoNothing()
    .returning();
  if (row) return { id: row.id, content: row.content as NarrativeTemplate };
  const [again] = await db.select().from(narrativeTemplates).where(eq(narrativeTemplates.version, seed.version));
  return { id: again.id, content: again.content as NarrativeTemplate };
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface ImportFile {
  name: string;
  text: string;
}

export interface ImportPreviewRow {
  name: string;
  lessonId: string | null;
  duration: string | null;
  episodes: number;
  givenFacts: number;
  warnings: string[];
  duplicateOf: string | null;
  importable: boolean;
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

const MAX_FILE_BYTES = 2_000_000;

/** Look before writing: what each file contains, and whether it is new. */
export async function previewNarrativeImport(files: ImportFile[]): Promise<ImportPreviewRow[]> {
  const rows: ImportPreviewRow[] = [];
  const existingByLesson = new Map<string, string>();
  const lessonIds = files.map((f) => parseNarrative(f.text).lessonId).filter((x): x is string => !!x);
  if (lessonIds.length) {
    const found = await db
      .select({ lessonId: narratives.lessonId, code: narratives.displayCode })
      .from(narratives)
      .where(and(inArray(narratives.lessonId, lessonIds), isNull(narratives.voidedAt)));
    for (const f of found) if (f.lessonId) existingByLesson.set(f.lessonId, f.code);
  }
  const shas = files.map((f) => sha256(f.text));
  const bySha = new Map<string, string>();
  if (shas.length) {
    const found = await db
      .select({ sha: narratives.sourceSha256, code: narratives.displayCode })
      .from(narratives)
      .where(inArray(narratives.sourceSha256, shas));
    for (const f of found) bySha.set(f.sha, f.code);
  }
  files.forEach((f, i) => {
    const p = parseNarrative(f.text);
    const tooBig = Buffer.byteLength(f.text, "utf8") > MAX_FILE_BYTES;
    const dup = bySha.get(shas[i]) ?? (p.lessonId ? existingByLesson.get(p.lessonId) : undefined) ?? null;
    const warnings = [...p.warnings];
    if (tooBig) warnings.push("File is larger than 2 MB.");
    rows.push({
      name: f.name,
      lessonId: p.lessonId,
      duration: p.duration,
      episodes: p.episodes.length,
      givenFacts: p.given.length,
      warnings,
      duplicateOf: dup,
      importable: !tooBig && p.episodes.length > 0 && !!p.lessonId && !dup,
    });
  });
  return rows;
}

async function nextDisplayCodes(n: number): Promise<string[]> {
  const [row] = await db
    .select({ max: sql<string | null>`max(${narratives.displayCode})` })
    .from(narratives)
    .where(like(narratives.displayCode, "N-%"));
  let k = row?.max ? Number(row.max.slice(2)) : 0;
  return Array.from({ length: n }, () => `N-${String(++k).padStart(4, "0")}`);
}

/**
 * Import the importable files. With `removeLessonIds` (Amendment §54) the
 * lesson id is replaced by the display code everywhere in the text and is
 * stored NOWHERE in the platform.
 */
export async function confirmNarrativeImport(
  actorId: string,
  files: ImportFile[],
  opts: { removeLessonIds: boolean; dataset?: Dataset },
): Promise<Result<{ created: Array<{ displayCode: string; label: string; lessonId: string; file: string }>; skipped: number }>> {
  const preview = await previewNarrativeImport(files);
  const todo = files.filter((_, i) => preview[i].importable);
  const codes = await nextDisplayCodes(todo.length);
  // lessonId/file are RETURNED (so the admin can save the code list) but,
  // with removeLessonIds, never stored.
  const created: Array<{ displayCode: string; label: string; lessonId: string; file: string }> = [];
  for (let i = 0; i < todo.length; i++) {
    const displayCode = codes[i];
    const parsed0 = parseNarrative(todo[i].text);
    const lessonId = parsed0.lessonId!;
    const stored = opts.removeLessonIds ? redactLessonId(todo[i].text, lessonId, displayCode) : todo[i].text;
    const parsed = opts.removeLessonIds ? parseNarrative(stored) : parsed0;
    const label = opts.removeLessonIds ? displayCode : lessonId;
    await db.insert(narratives).values({
      displayCode,
      label,
      lessonId: opts.removeLessonIds ? null : lessonId,
      durationLabel: parsed.duration,
      sourceFormat: "hapi-narrative-md",
      sourceText: stored,
      sourceSha256: sha256(stored),
      initialDoc: narrativeToDoc(parsed),
      parserVersion: PARSER_VERSION,
      episodeCount: parsed.episodes.length,
      dataset: opts.dataset ?? "live",
      importedBy: actorId,
    });
    created.push({ displayCode, label, lessonId, file: todo[i].name });
  }
  await audit(actorId, "narratives_imported", "narratives", created.map((c) => c.displayCode).join(","), {
    count: created.length,
    skipped: files.length - todo.length,
    removeLessonIds: opts.removeLessonIds,
  });
  return { ok: true, created, skipped: files.length - todo.length };
}

/* ------------------------------------------------------------------ */
/* Assignment                                                          */
/* ------------------------------------------------------------------ */

export interface Reviewer {
  id: string;
  name: string | null;
  email: string;
}

/** Active accounts that can review narratives (Narratives team or admin). */
export async function listReviewers(): Promise<Reviewer[]> {
  const rows = await db
    .selectDistinct({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .leftJoin(userTeams, and(eq(userTeams.userId, users.id), isNull(userTeams.removedAt)))
    .where(and(eq(users.isActive, true), sql`(${users.role} = 'admin' OR ${userTeams.team} = 'narratives')`))
    .orderBy(asc(users.name), asc(users.email));
  return rows;
}

async function isReviewer(userId: string): Promise<boolean> {
  return (await listReviewers()).some((r) => r.id === userId);
}

export async function assignNarrative(
  actorId: string,
  input: { narrativeId: string; assigneeId: string; orderNo: number; videoUrl: string | null },
): Promise<Result<{ assignmentId: string }>> {
  if (!Number.isInteger(input.orderNo) || input.orderNo < 1 || input.orderNo > 10_000) {
    return { ok: false, error: "Order must be a whole number from 1." };
  }
  const videoUrl = input.videoUrl ? normaliseVideoLink(input.videoUrl) : null;
  if (input.videoUrl && !videoUrl) return { ok: false, error: "The video link must be an https link or a Drive file id." };
  const [n] = await db.select().from(narratives).where(eq(narratives.id, input.narrativeId)).limit(1);
  if (!n || n.voidedAt) return { ok: false, error: "No such narrative." };
  if (!(await isReviewer(input.assigneeId))) {
    return { ok: false, error: "That person is not an active member of the Narratives team." };
  }
  const [open] = await db
    .select({ id: narrativeAssignments.id })
    .from(narrativeAssignments)
    .where(and(eq(narrativeAssignments.narrativeId, n.id), ne(narrativeAssignments.status, "returned")))
    .limit(1);
  if (open) return { ok: false, error: "This narrative is already assigned. Use Reassign." };
  const template = await getActiveTemplate();
  const assignmentId = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(narrativeAssignments)
      .values({
        narrativeId: n.id,
        assigneeId: input.assigneeId,
        orderNo: input.orderNo,
        videoUrl,
        templateId: template.id,
        assignedBy: actorId,
        dataset: n.dataset,
      })
      .returning({ id: narrativeAssignments.id });
    await tx.insert(narrativeDocuments).values({ assignmentId: a.id, doc: n.initialDoc, dataset: n.dataset });
    await tx.insert(narrativeRevisions).values({
      assignmentId: a.id,
      revision: 0,
      kind: "import",
      doc: n.initialDoc,
      createdBy: actorId,
      dataset: n.dataset,
    });
    return a.id;
  });
  await audit(actorId, "narrative_assigned", "narrative_assignments", assignmentId, {
    narrative: n.displayCode,
    assigneeId: input.assigneeId,
    orderNo: input.orderNo,
  });
  return { ok: true, assignmentId };
}

/** Change order or video link of an open assignment. */
export async function updateNarrativeAssignment(
  actorId: string,
  assignmentId: string,
  input: { orderNo?: number; videoUrl?: string | null },
): Promise<Result> {
  const patch: { orderNo?: number; videoUrl?: string | null } = {};
  if (input.orderNo !== undefined) {
    if (!Number.isInteger(input.orderNo) || input.orderNo < 1) return { ok: false, error: "Order must be a whole number from 1." };
    patch.orderNo = input.orderNo;
  }
  if (input.videoUrl !== undefined) {
    const v = input.videoUrl ? normaliseVideoLink(input.videoUrl) : null;
    if (input.videoUrl && !v) return { ok: false, error: "The video link must be an https link or a Drive file id." };
    patch.videoUrl = v;
  }
  await db.update(narrativeAssignments).set(patch).where(eq(narrativeAssignments.id, assignmentId));
  await audit(actorId, "narrative_assignment_updated", "narrative_assignments", assignmentId, patch);
  return { ok: true };
}

/**
 * Move a narrative to another reviewer. The old assignment is kept
 * ('returned', with the reason); the new reviewer continues from the
 * latest document (decision Q6 default) — the earlier work stays in history.
 */
export async function reassignNarrative(
  actorId: string,
  assignmentId: string,
  input: { assigneeId: string; reason: string; orderNo?: number },
): Promise<Result<{ assignmentId: string }>> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Say why it is being reassigned." };
  const [old] = await db.select().from(narrativeAssignments).where(eq(narrativeAssignments.id, assignmentId)).limit(1);
  if (!old || old.status === "returned") return { ok: false, error: "No such open assignment." };
  if (old.status === "submitted") return { ok: false, error: "This narrative is submitted. Reopen it first." };
  if (old.assigneeId === input.assigneeId) return { ok: false, error: "It is already assigned to that person." };
  if (!(await isReviewer(input.assigneeId))) {
    return { ok: false, error: "That person is not an active member of the Narratives team." };
  }
  const [doc] = await db.select().from(narrativeDocuments).where(eq(narrativeDocuments.assignmentId, assignmentId)).limit(1);
  const newId = await db.transaction(async (tx) => {
    await tx
      .update(narrativeAssignments)
      .set({ status: "returned", statusReason: reason })
      .where(eq(narrativeAssignments.id, assignmentId));
    await tx
      .update(narrativeSittings)
      .set({ endedAt: new Date() })
      .where(and(eq(narrativeSittings.assignmentId, assignmentId), isNull(narrativeSittings.endedAt)));
    const [a] = await tx
      .insert(narrativeAssignments)
      .values({
        narrativeId: old.narrativeId,
        assigneeId: input.assigneeId,
        orderNo: input.orderNo ?? old.orderNo,
        videoUrl: old.videoUrl,
        templateId: old.templateId,
        assignedBy: actorId,
        dataset: old.dataset,
        status: doc && doc.revision > 0 ? "in_progress" : "not_started",
      })
      .returning({ id: narrativeAssignments.id });
    await tx.insert(narrativeDocuments).values({
      assignmentId: a.id,
      doc: doc.doc,
      answers: doc.answers,
      comments: doc.comments,
      dataset: old.dataset,
    });
    await tx.insert(narrativeRevisions).values({
      assignmentId: a.id,
      revision: 0,
      kind: "import",
      doc: doc.doc,
      answers: doc.answers,
      comments: doc.comments,
      stats: { carriedFrom: assignmentId },
      createdBy: actorId,
      dataset: old.dataset,
    });
    return a.id;
  });
  await audit(actorId, "narrative_reassigned", "narrative_assignments", assignmentId, {
    to: input.assigneeId,
    newAssignmentId: newId,
    reason,
  });
  return { ok: true, assignmentId: newId };
}

/** Make a submitted narrative editable again (CLAUDE.md §7: with a reason). */
export async function reopenNarrative(actorId: string, assignmentId: string, reason: string): Promise<Result> {
  const why = reason.trim();
  if (!why) return { ok: false, error: "Say why it is being reopened." };
  const [a] = await db.select().from(narrativeAssignments).where(eq(narrativeAssignments.id, assignmentId)).limit(1);
  if (!a || a.status !== "submitted") return { ok: false, error: "Only a submitted narrative can be reopened." };
  const [doc] = await db.select().from(narrativeDocuments).where(eq(narrativeDocuments.assignmentId, assignmentId)).limit(1);
  await db.transaction(async (tx) => {
    await tx
      .update(narrativeAssignments)
      .set({ status: "in_progress", reopenCount: a.reopenCount + 1, statusReason: why })
      .where(eq(narrativeAssignments.id, assignmentId));
    await tx.insert(narrativeRevisions).values({
      assignmentId,
      revision: doc.revision,
      kind: "reopen",
      doc: doc.doc,
      answers: doc.answers,
      comments: doc.comments,
      stats: { reason: why },
      createdBy: actorId,
      dataset: a.dataset,
    });
  });
  await audit(actorId, "narrative_reopened", "narrative_assignments", assignmentId, { reason: why });
  return { ok: true };
}

/** Withdraw a narrative from use (soft). Open assignments are returned. */
export async function voidNarrative(actorId: string, narrativeId: string, reason: string): Promise<Result> {
  const why = reason.trim();
  if (!why) return { ok: false, error: "Say why the narrative is withdrawn." };
  await db.transaction(async (tx) => {
    await tx.update(narratives).set({ voidedAt: new Date(), voidReason: why }).where(eq(narratives.id, narrativeId));
    await tx
      .update(narrativeAssignments)
      .set({ status: "returned", statusReason: `narrative withdrawn: ${why}` })
      .where(and(eq(narrativeAssignments.narrativeId, narrativeId), inArray(narrativeAssignments.status, ["not_started", "in_progress"])));
  });
  await audit(actorId, "narrative_voided", "narratives", narrativeId, { reason: why });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Assignment sheet (CSV)                                              */
/* ------------------------------------------------------------------ */

export interface SheetRowPreview {
  line: number;
  orderNo: number | null;
  reviewer: string;
  lesson: string;
  narrativeId: string | null;
  narrativeCode: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  videoUrl: string | null;
  problems: string[];
}

const pick = (r: Record<string, string>, keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k];
  return "";
};

/**
 * Read an assignment sheet with columns like 00_assignments.csv:
 * order, reviewer (email or full name), video_id / lesson (lesson id or
 * N-code), video_drive_id / video_link. Nothing is written.
 */
export async function previewAssignmentSheet(csv: string): Promise<SheetRowPreview[]> {
  const rows = csvObjects(csv);
  const reviewers = await listReviewers();
  const all = await db
    .select({ id: narratives.id, code: narratives.displayCode, lessonId: narratives.lessonId })
    .from(narratives)
    .where(isNull(narratives.voidedAt));
  const assigned = new Set(
    (
      await db
        .select({ id: narrativeAssignments.narrativeId })
        .from(narrativeAssignments)
        .where(ne(narrativeAssignments.status, "returned"))
    ).map((r) => r.id),
  );
  return rows.map((r, i) => {
    const problems: string[] = [];
    const orderRaw = pick(r, ["order", "order_no"]);
    const orderNo = /^\d+$/.test(orderRaw) ? Number(orderRaw) : null;
    if (orderNo === null) problems.push("order is missing or not a number");
    const reviewer = pick(r, ["reviewer", "email", "reviewer_email", "enumerator"]);
    const rl = reviewer.toLowerCase();
    const matches = reviewers.filter((p) => p.email.toLowerCase() === rl || (p.name ?? "").toLowerCase() === rl);
    if (matches.length === 0) problems.push("reviewer not found in the Narratives team");
    if (matches.length > 1) problems.push("reviewer name matches more than one person; use the email");
    const lesson = pick(r, ["lesson", "lesson_id", "video_id", "narrative"]);
    const n = all.find((x) => x.lessonId === lesson || x.code === lesson);
    if (!n) problems.push("no imported narrative with that lesson id or N-code");
    else if (assigned.has(n.id)) problems.push("already assigned (use Reassign on the dashboard)");
    const linkRaw = pick(r, ["video_link", "video_url", "link", "video_drive_id"]);
    const videoUrl = linkRaw ? normaliseVideoLink(linkRaw) : null;
    if (linkRaw && !videoUrl) problems.push("video link is not an https link or Drive id");
    return {
      line: i + 2,
      orderNo,
      reviewer,
      lesson,
      narrativeId: n?.id ?? null,
      narrativeCode: n?.code ?? null,
      assigneeId: matches.length === 1 ? matches[0].id : null,
      assigneeName: matches.length === 1 ? matches[0].name || matches[0].email : null,
      videoUrl,
      problems,
    };
  });
}

export async function confirmAssignmentSheet(
  actorId: string,
  csv: string,
): Promise<Result<{ assigned: number; skipped: number }>> {
  const preview = await previewAssignmentSheet(csv);
  let assigned = 0;
  for (const row of preview) {
    if (row.problems.length || !row.narrativeId || !row.assigneeId || row.orderNo === null) continue;
    const r = await assignNarrative(actorId, {
      narrativeId: row.narrativeId,
      assigneeId: row.assigneeId,
      orderNo: row.orderNo,
      videoUrl: row.videoUrl,
    });
    if (r.ok) assigned++;
  }
  return { ok: true, assigned, skipped: preview.length - assigned };
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface DashboardRow {
  narrativeId: string;
  displayCode: string;
  label: string;
  lessonId: string | null;
  durationLabel: string | null;
  episodes: number;
  importedAt: Date;
  assignmentId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  orderNo: number | null;
  videoUrl: string | null;
  status: "unassigned" | "not_started" | "in_progress" | "submitted";
  updatedAt: Date | null;
  submittedAt: Date | null;
  revision: number | null;
  reopenCount: number;
  activeMinutes: number;
  lastActivity: Date | null;
  stats: DocStats | null;
}

export async function getNarrativeDashboard(dataset: Dataset = "live"): Promise<DashboardRow[]> {
  const ns = await db
    .select()
    .from(narratives)
    .where(and(isNull(narratives.voidedAt), eq(narratives.dataset, dataset)))
    .orderBy(asc(narratives.displayCode));
  if (ns.length === 0) return [];
  const as = await db
    .select({
      a: narrativeAssignments,
      name: users.name,
      email: users.email,
      revision: narrativeDocuments.revision,
      doc: narrativeDocuments.doc,
      comments: narrativeDocuments.comments,
      updatedAt: narrativeDocuments.updatedAt,
    })
    .from(narrativeAssignments)
    .innerJoin(users, eq(users.id, narrativeAssignments.assigneeId))
    .leftJoin(narrativeDocuments, eq(narrativeDocuments.assignmentId, narrativeAssignments.id))
    .where(
      and(
        inArray(narrativeAssignments.narrativeId, ns.map((n) => n.id)),
        ne(narrativeAssignments.status, "returned"),
      ),
    );
  const ids = as.map((x) => x.a.id);
  const time = ids.length
    ? await db
        .select({
          assignmentId: narrativeSittings.assignmentId,
          minutes: sql<number>`coalesce(sum(extract(epoch from (coalesce(${narrativeSittings.endedAt}, ${narrativeSittings.lastHeartbeatAt}) - ${narrativeSittings.startedAt}))) / 60, 0)`,
          last: sql<Date | null>`max(${narrativeSittings.lastHeartbeatAt})`,
        })
        .from(narrativeSittings)
        .where(inArray(narrativeSittings.assignmentId, ids))
        .groupBy(narrativeSittings.assignmentId)
    : [];
  const timeBy = new Map(time.map((t) => [t.assignmentId, t]));
  const byNarrative = new Map(as.map((x) => [x.a.narrativeId, x]));
  return ns.map((n) => {
    const x = byNarrative.get(n.id);
    const t = x ? timeBy.get(x.a.id) : undefined;
    const lastActivity = [x?.updatedAt, t?.last ? new Date(t.last) : null]
      .filter((d): d is Date => !!d)
      .sort((p, q) => q.getTime() - p.getTime())[0] ?? null;
    return {
      narrativeId: n.id,
      displayCode: n.displayCode,
      label: n.label,
      lessonId: n.lessonId,
      durationLabel: n.durationLabel,
      episodes: n.episodeCount,
      importedAt: n.importedAt,
      assignmentId: x?.a.id ?? null,
      assigneeId: x?.a.assigneeId ?? null,
      assigneeName: x ? x.name || x.email : null,
      orderNo: x?.a.orderNo ?? null,
      videoUrl: x?.a.videoUrl ?? null,
      status: x ? x.a.status === "returned" ? "unassigned" : x.a.status : "unassigned",
      updatedAt: x && x.revision ? x.updatedAt : null,
      submittedAt: x?.a.submittedAt ?? null,
      revision: x?.revision ?? null,
      reopenCount: x?.a.reopenCount ?? 0,
      activeMinutes: Math.round(Number(t?.minutes ?? 0)),
      lastActivity,
      stats:
        x && x.doc
          ? docStats(x.doc as PMNode, (x.comments ?? []) as NarrativeComment[], n.initialDoc as PMNode)
          : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Read-only view, history, restore                                    */
/* ------------------------------------------------------------------ */

export interface AdminNarrativeView {
  assignmentId: string;
  narrativeId: string;
  displayCode: string;
  label: string;
  lessonId: string | null;
  durationLabel: string | null;
  assigneeId: string;
  assigneeName: string;
  orderNo: number;
  videoUrl: string | null;
  status: "not_started" | "in_progress" | "submitted" | "returned";
  statusReason: string | null;
  revision: number;
  doc: PMNode;
  initialDoc: PMNode;
  answers: NarrativeAnswers;
  comments: NarrativeComment[];
  updatedAt: Date;
  submittedAt: Date | null;
  template: NarrativeTemplate | null;
  activeMinutes: number;
  firstStart: Date | null;
  lastEnd: Date | null;
}

export async function getAdminNarrative(assignmentId: string): Promise<AdminNarrativeView | null> {
  const [row] = await db
    .select({ a: narrativeAssignments, n: narratives, name: users.name, email: users.email, d: narrativeDocuments })
    .from(narrativeAssignments)
    .innerJoin(narratives, eq(narratives.id, narrativeAssignments.narrativeId))
    .innerJoin(users, eq(users.id, narrativeAssignments.assigneeId))
    .innerJoin(narrativeDocuments, eq(narrativeDocuments.assignmentId, narrativeAssignments.id))
    .where(eq(narrativeAssignments.id, assignmentId))
    .limit(1);
  if (!row) return null;
  let template: NarrativeTemplate | null = null;
  if (row.a.templateId) {
    const [t] = await db.select().from(narrativeTemplates).where(eq(narrativeTemplates.id, row.a.templateId)).limit(1);
    template = (t?.content as NarrativeTemplate) ?? null;
  }
  const [time] = await db
    .select({
      minutes: sql<number>`coalesce(sum(extract(epoch from (coalesce(${narrativeSittings.endedAt}, ${narrativeSittings.lastHeartbeatAt}) - ${narrativeSittings.startedAt}))) / 60, 0)`,
      first: sql<Date | null>`min(${narrativeSittings.startedAt})`,
      last: sql<Date | null>`max(coalesce(${narrativeSittings.endedAt}, ${narrativeSittings.lastHeartbeatAt}))`,
    })
    .from(narrativeSittings)
    .where(eq(narrativeSittings.assignmentId, assignmentId));
  return {
    assignmentId: row.a.id,
    narrativeId: row.n.id,
    displayCode: row.n.displayCode,
    label: row.n.label,
    lessonId: row.n.lessonId,
    durationLabel: row.n.durationLabel,
    assigneeId: row.a.assigneeId,
    assigneeName: row.name || row.email,
    orderNo: row.a.orderNo,
    videoUrl: row.a.videoUrl,
    status: row.a.status,
    statusReason: row.a.statusReason,
    revision: row.d.revision,
    doc: row.d.doc as PMNode,
    initialDoc: row.n.initialDoc as PMNode,
    answers: (row.d.answers ?? {}) as NarrativeAnswers,
    comments: (row.d.comments ?? []) as NarrativeComment[],
    updatedAt: row.d.updatedAt,
    submittedAt: row.a.submittedAt,
    template,
    activeMinutes: Math.round(Number(time?.minutes ?? 0)),
    firstStart: time?.first ? new Date(time.first) : null,
    lastEnd: time?.last ? new Date(time.last) : null,
  };
}

export interface RevisionRow {
  id: string;
  revision: number;
  kind: string;
  createdAt: Date;
  createdByName: string | null;
  stats: Record<string, unknown> | null;
}

export async function listRevisions(assignmentId: string): Promise<RevisionRow[]> {
  const rows = await db
    .select({
      id: narrativeRevisions.id,
      revision: narrativeRevisions.revision,
      kind: narrativeRevisions.kind,
      createdAt: narrativeRevisions.createdAt,
      name: users.name,
      email: users.email,
      stats: narrativeRevisions.stats,
    })
    .from(narrativeRevisions)
    .leftJoin(users, eq(users.id, narrativeRevisions.createdBy))
    .where(eq(narrativeRevisions.assignmentId, assignmentId))
    .orderBy(desc(narrativeRevisions.createdAt));
  return rows.map((r) => ({
    id: r.id,
    revision: r.revision,
    kind: r.kind,
    createdAt: r.createdAt,
    createdByName: r.name || r.email,
    stats: (r.stats ?? null) as Record<string, unknown> | null,
  }));
}

export async function getRevision(revisionId: string) {
  const [r] = await db.select().from(narrativeRevisions).where(eq(narrativeRevisions.id, revisionId)).limit(1);
  return r ?? null;
}

/**
 * Put an earlier version back as the working copy. Writes a NEW revision;
 * the version it replaces stays in history. Not for submitted narratives
 * (reopen first). Open editors see a conflict on their next save and keep
 * their own copy as a conflict_copy, so nothing is lost either way.
 */
export async function restoreRevision(actorId: string, assignmentId: string, revisionId: string): Promise<Result<{ revision: number }>> {
  const rev = await getRevision(revisionId);
  if (!rev || rev.assignmentId !== assignmentId) return { ok: false, error: "No such version." };
  const [a] = await db.select().from(narrativeAssignments).where(eq(narrativeAssignments.id, assignmentId)).limit(1);
  if (!a || a.status === "returned") return { ok: false, error: "No such open assignment." };
  if (a.status === "submitted") return { ok: false, error: "Reopen the narrative before restoring a version." };
  const next = await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(narrativeDocuments).where(eq(narrativeDocuments.assignmentId, assignmentId)).for("update");
    await tx.insert(narrativeRevisions).values({
      assignmentId,
      revision: cur.revision,
      kind: "snapshot",
      doc: cur.doc,
      answers: cur.answers,
      comments: cur.comments,
      stats: { reason: "before_restore" },
      createdBy: actorId,
      dataset: a.dataset,
    });
    const revision = cur.revision + 1;
    await tx
      .update(narrativeDocuments)
      .set({
        revision,
        doc: rev.doc,
        answers: rev.answers,
        comments: rev.comments,
        updatedAt: new Date(),
        updatedByClient: `admin-restore:${actorId}`,
      })
      .where(eq(narrativeDocuments.assignmentId, assignmentId));
    await tx.insert(narrativeRevisions).values({
      assignmentId,
      revision,
      kind: "restore",
      doc: rev.doc,
      answers: rev.answers,
      comments: rev.comments,
      stats: { restoredFrom: revisionId },
      createdBy: actorId,
      dataset: a.dataset,
    });
    return revision;
  });
  await audit(actorId, "narrative_version_restored", "narrative_assignments", assignmentId, { revisionId });
  return { ok: true, revision: next };
}

/* ------------------------------------------------------------------ */
/* Word downloads (PLAN §4)                                            */
/* ------------------------------------------------------------------ */

export interface DocxFile {
  filename: string;
  bytes: Buffer;
  sha256: string;
  view: AdminNarrativeView;
  version: "submitted" | "current";
  revision: number;
}

/**
 * One narrative as .docx. A submitted narrative is exported exactly as
 * submitted (its 'submit' revision); anything else as the current copy.
 */
export async function buildNarrativeDocx(actorId: string | null, assignmentId: string, audited = true): Promise<DocxFile | null> {
  const view = await getAdminNarrative(assignmentId);
  if (!view) return null;
  let { doc, answers, comments, revision } = view;
  let version: "submitted" | "current" = "current";
  if (view.status === "submitted") {
    const [sub] = await db
      .select()
      .from(narrativeRevisions)
      .where(and(eq(narrativeRevisions.assignmentId, assignmentId), eq(narrativeRevisions.kind, "submit")))
      .orderBy(desc(narrativeRevisions.createdAt))
      .limit(1);
    if (sub) {
      doc = sub.doc as PMNode;
      answers = (sub.answers ?? {}) as NarrativeAnswers;
      comments = (sub.comments ?? []) as NarrativeComment[];
      revision = sub.revision;
      version = "submitted";
    }
  }
  const { narrativeToDocx, docxFilename } = await import("@/lib/narratives/docx");
  const bytes = await narrativeToDocx({
    template: view.template,
    label: view.label,
    reviewerName: view.assigneeName,
    durationLabel: view.durationLabel,
    doc,
    answers,
    comments,
    activeMinutes: view.activeMinutes,
    firstStart: view.firstStart,
    lastEnd: view.lastEnd,
    submittedAt: view.submittedAt,
  });
  const filename = docxFilename(view.orderNo, view.lessonId ?? view.label, view.assigneeName);
  const file = { filename, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), view, version, revision };
  if (audited) {
    await audit(actorId, "narrative_docx_downloaded", "narrative_assignments", assignmentId, {
      filename,
      version,
      revision,
      sha256: file.sha256,
    });
  }
  return file;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * All submitted (or all assigned) narratives as one .zip with a manifest.
 * `since` keeps only narratives submitted at or after that moment (the
 * dashboard's "submitted in the last 24 hours" download).
 */
export async function buildNarrativesZip(
  actorId: string | null,
  which: "submitted" | "all",
  dataset: Dataset = "live",
  since?: Date,
): Promise<{ filename: string; bytes: Uint8Array; count: number }> {
  const rows = (await getNarrativeDashboard(dataset)).filter(
    (r) =>
      r.assignmentId &&
      (which === "all" || r.status === "submitted") &&
      (!since || (r.submittedAt !== null && r.submittedAt >= since)),
  );
  const { toZip } = await import("@/lib/export/zip");
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  const manifest = [
    ["file", "narrative_code", "label", "lesson_id", "reviewer", "order", "status", "version", "revision", "submitted_at", "active_minutes", "red_chars", "struck_chars", "comments", "original_words_removed", "sha256"],
  ];
  for (const r of rows) {
    const f = await buildNarrativeDocx(actorId, r.assignmentId!, false);
    if (!f) continue;
    let name = f.filename;
    let k = 2;
    while (entries.some((e) => e.name === name)) name = f.filename.replace(/\.docx$/, `_${k++}.docx`);
    entries.push({ name, data: new Uint8Array(f.bytes) });
    manifest.push([
      name,
      r.displayCode,
      r.label,
      r.lessonId ?? "",
      r.assigneeName ?? "",
      String(r.orderNo ?? ""),
      r.status,
      f.version,
      String(f.revision),
      r.submittedAt ? r.submittedAt.toISOString() : "",
      String(r.activeMinutes),
      String(r.stats?.redChars ?? ""),
      String(r.stats?.struckChars ?? ""),
      String(r.stats?.comments ?? ""),
      String(r.stats?.originalWordsRemoved ?? ""),
      f.sha256,
    ]);
  }
  const csv = "﻿" + manifest.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  entries.push({ name: "MANIFEST.csv", data: new TextEncoder().encode(csv) });
  const stamp = new Date().toISOString().slice(0, 10);
  const label = since ? `${which}_last24h` : which;
  await audit(actorId, "narratives_zip_downloaded", "narrative_assignments", label, { count: rows.length });
  return { filename: `narratives_${label}_${stamp}.zip`, bytes: toZip(entries), count: rows.length };
}

/* ------------------------------------------------------------------ */
/* Nightly copy into the Harvard Drive (Amendment §58)                 */
/* ------------------------------------------------------------------ */

export interface BackupFile {
  name: string;
  mimeType: string;
  data: Uint8Array;
}

/**
 * What the nightly copy contains:
 *  1. clobs-narratives_<date>.zip — every assigned narrative as Word (the
 *     submitted version when submitted, otherwise the current text) with
 *     MANIFEST.csv;
 *  2. clobs-narratives-data_<date>.json.gz — the narrative tables as data:
 *     narratives (no lesson IDs are stored, Amendment §57), assignments,
 *     working copies, the versions that matter for recovery (submit,
 *     reopen, restore, conflict copies) in full, the rest as metadata, and
 *     measured sittings — enough to rebuild every review.
 */
export async function buildNightlyBackup(dataset: Dataset = "live", now = new Date()): Promise<BackupFile[]> {
  const { gzipSync } = await import("node:zlib");
  const stamp = now.toISOString().slice(0, 10);
  const zip = await buildNarrativesZip(null, "all", dataset);
  const ns = await db
    .select({
      id: narratives.id,
      displayCode: narratives.displayCode,
      label: narratives.label,
      durationLabel: narratives.durationLabel,
      episodeCount: narratives.episodeCount,
      initialDoc: narratives.initialDoc,
      importedAt: narratives.importedAt,
      voidedAt: narratives.voidedAt,
      voidReason: narratives.voidReason,
    })
    .from(narratives)
    .where(eq(narratives.dataset, dataset));
  const ids = ns.map((n) => n.id);
  const asg = ids.length
    ? await db
        .select({ a: narrativeAssignments, name: users.name, email: users.email })
        .from(narrativeAssignments)
        .innerJoin(users, eq(users.id, narrativeAssignments.assigneeId))
        .where(inArray(narrativeAssignments.narrativeId, ids))
    : [];
  const asgIds = asg.map((x) => x.a.id);
  const docs = asgIds.length
    ? await db.select().from(narrativeDocuments).where(inArray(narrativeDocuments.assignmentId, asgIds))
    : [];
  const revs = asgIds.length
    ? await db.select().from(narrativeRevisions).where(inArray(narrativeRevisions.assignmentId, asgIds))
    : [];
  const sittings = asgIds.length
    ? await db.select().from(narrativeSittings).where(inArray(narrativeSittings.assignmentId, asgIds))
    : [];
  const full = new Set(["submit", "reopen", "restore", "conflict_copy"]);
  const data = {
    createdAt: now.toISOString(),
    dataset,
    narratives: ns,
    assignments: asg.map((x) => ({ ...x.a, assigneeName: x.name, assigneeEmail: x.email })),
    documents: docs,
    revisions: revs.map((r) =>
      full.has(r.kind) ? r : { ...r, doc: undefined, answers: undefined, comments: undefined, contentOmitted: true },
    ),
    sittings,
  };
  return [
    { name: `clobs-narratives_${stamp}.zip`, mimeType: "application/zip", data: zip.bytes },
    {
      name: `clobs-narratives-data_${stamp}.json.gz`,
      mimeType: "application/gzip",
      data: new Uint8Array(gzipSync(Buffer.from(JSON.stringify(data)))),
    },
  ];
}

/** Build the nightly copy and upload it; audited either way. */
export async function runNightlyBackup(opts: {
  actorId: string | null;
  serviceAccountJson: string | undefined;
  folderId: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<Result<{ files: Array<{ id: string; name: string; bytes: number }> }>> {
  const { getAccessToken, parseServiceAccount, uploadToDrive } = await import("@/lib/backup/google-drive");
  const sa = parseServiceAccount(opts.serviceAccountJson);
  if (!sa || !opts.folderId) {
    return { ok: false, error: "The Drive copy is not configured (GOOGLE_SERVICE_ACCOUNT_JSON and DRIVE_BACKUP_FOLDER_ID)." };
  }
  try {
    const files = await buildNightlyBackup();
    const token = await getAccessToken(sa, opts.fetchImpl);
    const uploaded = [];
    for (const f of files) uploaded.push(await uploadToDrive(token, opts.folderId, f, opts.fetchImpl));
    await audit(opts.actorId, "nightly_backup_uploaded", "narratives", "drive", { files: uploaded });
    return { ok: true, files: uploaded };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await audit(opts.actorId, "nightly_backup_failed", "narratives", "drive", { error: error.slice(0, 500) });
    return { ok: false, error };
  }
}
