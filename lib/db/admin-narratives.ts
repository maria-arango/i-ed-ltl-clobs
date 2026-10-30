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
import { driveNameLookup } from "@/lib/backup/google-drive";
import { csvObjects, normaliseVideoLink } from "@/lib/narratives/csv";
import { docStats, type DocStats, type NarrativeAnswers, type NarrativeComment, type PMNode } from "@/lib/narratives/doc";
import { narrativeToDoc, parseNarrative, PARSER_VERSION } from "@/lib/narratives/parse";
import { parseReviewScript, SCRIPT_FORMAT, SCRIPT_PARSER_VERSION, scriptSourceText, scriptToDoc } from "@/lib/narratives/script";
import { checkVideo, sidOf, type DriveLookup, type VideoCheckResult } from "@/lib/narratives/video-check";
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

/**
 * One uploaded file: a pipeline NARRATIVE.md as text, or a review script
 * Word file (Amendment §61) as base64.
 */
export interface ImportFile {
  name: string;
  text?: string;
  dataBase64?: string;
}

export interface ImportPreviewRow {
  name: string;
  format: "script" | "narrative";
  lessonId: string | null;
  duration: string | null;
  /** Episodes of a NARRATIVE.md, lines of a review script. */
  episodes: number;
  givenFacts: number;
  warnings: string[];
  duplicateOf: string | null;
  importable: boolean;
}

function sha256(s: string | Uint8Array): string {
  return createHash("sha256").update(s).digest("hex");
}

const MAX_FILE_BYTES = 2_000_000;

/** What one file holds, in a shape common to both formats. */
interface ReadFile {
  format: "script" | "narrative";
  lessonId: string | null;
  duration: string | null;
  units: number;
  givenFacts: number;
  warnings: string[];
  bytes: number;
  sha: string;
  sourceText: string;
  initialDoc: PMNode;
}

async function readImportFile(f: ImportFile): Promise<ReadFile> {
  if (f.dataBase64 !== undefined) {
    const data = new Uint8Array(Buffer.from(f.dataBase64, "base64"));
    const p = await parseReviewScript(data);
    return {
      format: "script",
      lessonId: p.lessonId,
      duration: p.duration,
      units: p.lineCount,
      givenFacts: 0,
      warnings: p.warnings,
      bytes: data.length,
      sha: sha256(data),
      sourceText: scriptSourceText(p),
      initialDoc: scriptToDoc(p),
    };
  }
  const text = f.text ?? "";
  const p = parseNarrative(text);
  return {
    format: "narrative",
    lessonId: p.lessonId,
    duration: p.duration,
    units: p.episodes.length,
    givenFacts: p.given.length,
    warnings: p.warnings,
    bytes: Buffer.byteLength(text, "utf8"),
    sha: sha256(text),
    sourceText: text,
    initialDoc: narrativeToDoc(p),
  };
}

/**
 * Look before writing: what each file contains, and whether it is new in
 * the target dataset ('training' = practice narratives).
 */
export async function previewNarrativeImport(files: ImportFile[], dataset: Dataset = "live"): Promise<ImportPreviewRow[]> {
  const read = await Promise.all(files.map(readImportFile));
  const existingByLesson = new Map<string, string>();
  const lessonIds = read.map((r) => r.lessonId).filter((x): x is string => !!x);
  if (lessonIds.length) {
    const found = await db
      .select({ lessonId: narratives.lessonId, code: narratives.displayCode })
      .from(narratives)
      .where(and(inArray(narratives.lessonId, lessonIds), isNull(narratives.voidedAt), eq(narratives.dataset, dataset)));
    for (const f of found) if (f.lessonId) existingByLesson.set(f.lessonId, f.code);
  }
  const bySha = new Map<string, string>();
  if (read.length) {
    const found = await db
      .select({ sha: narratives.sourceSha256, code: narratives.displayCode })
      .from(narratives)
      .where(and(inArray(narratives.sourceSha256, read.map((r) => r.sha)), eq(narratives.dataset, dataset)));
    for (const f of found) bySha.set(f.sha, f.code);
  }
  const seenInBatch = new Map<string, string>();
  return read.map((r, i) => {
    const tooBig = r.bytes > MAX_FILE_BYTES;
    const warnings = [...r.warnings];
    if (tooBig) warnings.push("File is larger than 2 MB.");
    let dup = bySha.get(r.sha) ?? (r.lessonId ? existingByLesson.get(r.lessonId) : undefined) ?? null;
    if (!dup && r.lessonId && seenInBatch.has(r.lessonId)) {
      warnings.push(`Same lesson as ${seenInBatch.get(r.lessonId)} in this upload.`);
      dup = seenInBatch.get(r.lessonId)!;
    }
    if (r.lessonId && !seenInBatch.has(r.lessonId)) seenInBatch.set(r.lessonId, files[i].name);
    return {
      name: files[i].name,
      format: r.format,
      lessonId: r.lessonId,
      duration: r.duration,
      episodes: r.units,
      givenFacts: r.givenFacts,
      warnings,
      duplicateOf: dup,
      importable: !tooBig && r.units > 0 && !!r.lessonId && !dup,
    };
  });
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
 * Import the importable files. The lesson id (tr_id) is kept as the label
 * and in lesson_id, both admin-only, and stays in the narrative's own text
 * so enumerators can check it against the video (Amendment §61, replacing
 * §57). Enumerators see their narratives as "Video 1, 2, 3…".
 */
export async function confirmNarrativeImport(
  actorId: string,
  files: ImportFile[],
  opts: { dataset?: Dataset } = {},
): Promise<Result<{ created: Array<{ displayCode: string; lessonId: string; file: string }>; skipped: number }>> {
  const dataset = opts.dataset ?? "live";
  const preview = await previewNarrativeImport(files, dataset);
  const todo = files.filter((_, i) => preview[i].importable);
  const codes = await nextDisplayCodes(todo.length);
  const created: Array<{ displayCode: string; lessonId: string; file: string }> = [];
  for (let i = 0; i < todo.length; i++) {
    const displayCode = codes[i];
    const r = await readImportFile(todo[i]);
    const lessonId = r.lessonId!;
    await db.insert(narratives).values({
      displayCode,
      label: lessonId,
      lessonId,
      durationLabel: r.duration,
      sourceFormat: r.format === "script" ? SCRIPT_FORMAT : "hapi-narrative-md",
      sourceText: r.sourceText,
      sourceSha256: r.sha,
      initialDoc: r.initialDoc,
      parserVersion: r.format === "script" ? SCRIPT_PARSER_VERSION : PARSER_VERSION,
      episodeCount: r.units,
      dataset,
      importedBy: actorId,
    });
    created.push({ displayCode, lessonId, file: todo[i].name });
  }
  await audit(actorId, "narratives_imported", "narratives", created.map((c) => c.displayCode).join(","), {
    count: created.length,
    skipped: files.length - todo.length,
    dataset,
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

/**
 * The order numbers a person's open narratives already use, per dataset.
 * Enumerators know a narrative as "Video <order>", so an order is used at
 * most once per person (practice narratives are numbered separately).
 */
async function usedOrders(assigneeId: string, dataset: Dataset, exceptAssignmentId?: string): Promise<Set<number>> {
  const rows = await db
    .select({ id: narrativeAssignments.id, orderNo: narrativeAssignments.orderNo })
    .from(narrativeAssignments)
    .where(
      and(
        eq(narrativeAssignments.assigneeId, assigneeId),
        eq(narrativeAssignments.dataset, dataset),
        ne(narrativeAssignments.status, "returned"),
      ),
    );
  return new Set(rows.filter((r) => r.id !== exceptAssignmentId).map((r) => r.orderNo));
}

const nextFree = (used: Set<number>) => {
  let k = 1;
  while (used.has(k)) k++;
  return k;
};

/** Each reviewer's next free order number (real narratives and practice). */
export async function nextOrders(): Promise<{ live: Record<string, number>; training: Record<string, number> }> {
  const rows = await db
    .select({ assigneeId: narrativeAssignments.assigneeId, orderNo: narrativeAssignments.orderNo, dataset: narrativeAssignments.dataset })
    .from(narrativeAssignments)
    .where(ne(narrativeAssignments.status, "returned"));
  const used = { live: new Map<string, Set<number>>(), training: new Map<string, Set<number>>() };
  for (const r of rows) {
    if (r.dataset !== "live" && r.dataset !== "training") continue;
    const m = used[r.dataset];
    (m.get(r.assigneeId) ?? m.set(r.assigneeId, new Set()).get(r.assigneeId)!).add(r.orderNo);
  }
  const out = { live: {} as Record<string, number>, training: {} as Record<string, number> };
  for (const k of ["live", "training"] as const) for (const [id, set] of used[k]) out[k][id] = nextFree(set);
  return out;
}

/** The Drive name lookup for video checks; null when no service account is configured. */
export function defaultDriveLookup(): DriveLookup | null {
  return driveNameLookup(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

function videoNote(v: VideoCheckResult): string | undefined {
  return v.ok && v.method === null ? v.note : undefined;
}

export async function assignNarrative(
  actorId: string,
  input: { narrativeId: string; assigneeId: string; orderNo: number; videoUrl: string | null; videoFile?: string | null },
  lookup: DriveLookup | null = defaultDriveLookup(),
): Promise<Result<{ assignmentId: string; videoNote?: string }>> {
  if (!Number.isInteger(input.orderNo) || input.orderNo < 1 || input.orderNo > 10_000) {
    return { ok: false, error: "Order must be a whole number from 1." };
  }
  const videoUrl = input.videoUrl ? normaliseVideoLink(input.videoUrl) : null;
  if (input.videoUrl && !videoUrl) return { ok: false, error: "The video link must be an https link or a Drive file id." };
  const [n] = await db.select().from(narratives).where(eq(narratives.id, input.narrativeId)).limit(1);
  if (!n || n.voidedAt) return { ok: false, error: "No such narrative." };
  const video = await checkVideo({ lessonId: n.lessonId, videoUrl, sheetFile: input.videoFile ?? null, lookup });
  if (!video.ok) return { ok: false, error: `Wrong video: ${video.problem}.` };
  if (!(await isReviewer(input.assigneeId))) {
    return { ok: false, error: "That person is not an active member of the Narratives team." };
  }
  const [open] = await db
    .select({ id: narrativeAssignments.id })
    .from(narrativeAssignments)
    .where(and(eq(narrativeAssignments.narrativeId, n.id), ne(narrativeAssignments.status, "returned")))
    .limit(1);
  if (open) return { ok: false, error: "This narrative is already assigned. Use Reassign." };
  const used = await usedOrders(input.assigneeId, n.dataset);
  if (used.has(input.orderNo)) {
    return {
      ok: false,
      error: `This person already has a Video ${input.orderNo}. Use order ${nextFree(used)} (their next free number) or another free one.`,
    };
  }
  // Review scripts carry their own instructions and have no questions
  // (María, 2026-10-30); NARRATIVE.md narratives keep the review template.
  const templateId = n.sourceFormat === SCRIPT_FORMAT ? null : (await getActiveTemplate()).id;
  const assignmentId = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(narrativeAssignments)
      .values({
        narrativeId: n.id,
        assigneeId: input.assigneeId,
        orderNo: input.orderNo,
        videoUrl,
        videoFile: video.fileName,
        videoCheck: video.method,
        templateId,
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
    videoCheck: video.method,
  });
  return { ok: true, assignmentId, videoNote: videoNote(video) };
}

/** Change order or video link of an open assignment. */
export async function updateNarrativeAssignment(
  actorId: string,
  assignmentId: string,
  input: { orderNo?: number; videoUrl?: string | null },
  lookup: DriveLookup | null = defaultDriveLookup(),
): Promise<Result<{ videoNote?: string }>> {
  const patch: { orderNo?: number; videoUrl?: string | null; videoFile?: string | null; videoCheck?: string | null } = {};
  let note: string | undefined;
  if (input.orderNo !== undefined) {
    if (!Number.isInteger(input.orderNo) || input.orderNo < 1) return { ok: false, error: "Order must be a whole number from 1." };
    patch.orderNo = input.orderNo;
  }
  const [row] = await db
    .select({
      videoUrl: narrativeAssignments.videoUrl,
      lessonId: narratives.lessonId,
      assigneeId: narrativeAssignments.assigneeId,
      dataset: narrativeAssignments.dataset,
    })
    .from(narrativeAssignments)
    .innerJoin(narratives, eq(narratives.id, narrativeAssignments.narrativeId))
    .where(eq(narrativeAssignments.id, assignmentId))
    .limit(1);
  if (!row) return { ok: false, error: "No such assignment." };
  if (patch.orderNo !== undefined) {
    const used = await usedOrders(row.assigneeId, row.dataset, assignmentId);
    if (used.has(patch.orderNo)) return { ok: false, error: `This person already has a Video ${patch.orderNo}. Choose a free number.` };
  }
  if (input.videoUrl !== undefined) {
    const v = input.videoUrl ? normaliseVideoLink(input.videoUrl) : null;
    if (input.videoUrl && !v) return { ok: false, error: "The video link must be an https link or a Drive file id." };
    if (v !== row.videoUrl) {
      const video = await checkVideo({ lessonId: row.lessonId, videoUrl: v, sheetFile: null, lookup });
      if (!video.ok) return { ok: false, error: `Wrong video: ${video.problem}.` };
      patch.videoUrl = v;
      patch.videoFile = video.fileName;
      patch.videoCheck = video.method;
      note = videoNote(video);
    }
  }
  await db.update(narrativeAssignments).set(patch).where(eq(narrativeAssignments.id, assignmentId));
  await audit(actorId, "narrative_assignment_updated", "narrative_assignments", assignmentId, patch);
  return { ok: true, videoNote: note };
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
  // Keep the order if the new reviewer has it free, else their next free number.
  const used = await usedOrders(input.assigneeId, old.dataset);
  const wanted = input.orderNo ?? old.orderNo;
  const orderNo = used.has(wanted) ? nextFree(used) : wanted;
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
        orderNo,
        videoUrl: old.videoUrl,
        videoFile: old.videoFile,
        videoCheck: old.videoCheck,
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
  lessonId: string | null;
  sid: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  videoUrl: string | null;
  /** The sheet's video_file column. */
  sheetFile: string | null;
  /** The file name the video was checked against, and how. */
  videoFile: string | null;
  videoCheck: "drive" | "sheet" | null;
  /** Why the video could not be checked (the row can still be assigned). */
  videoNote: string | null;
  problems: string[];
}

const pick = (r: Record<string, string>, keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k];
  return "";
};

/**
 * Read an assignment sheet with columns like 00_assignments.csv: order,
 * reviewer (email or full name), video_id (the lesson's tr_id, or an
 * N-code), video_file and video_drive_id / video_link. Each row's video is
 * checked against the narrative's own lesson id (Amendment §61): by the
 * name Google Drive reports for the linked file, and by video_file. A row
 * whose video belongs to another lesson cannot be assigned. Nothing is
 * written. Practice narratives are assigned one at a time, not by sheet.
 */
export async function previewAssignmentSheet(
  csv: string,
  lookup: DriveLookup | null = defaultDriveLookup(),
  dataset: Dataset = "live",
): Promise<SheetRowPreview[]> {
  const rows = csvObjects(csv);
  const reviewers = await listReviewers();
  const all = await db
    .select({ id: narratives.id, code: narratives.displayCode, lessonId: narratives.lessonId })
    .from(narratives)
    .where(and(isNull(narratives.voidedAt), eq(narratives.dataset, dataset)));
  const assigned = new Set(
    (
      await db
        .select({ id: narrativeAssignments.narrativeId })
        .from(narrativeAssignments)
        .where(ne(narrativeAssignments.status, "returned"))
    ).map((r) => r.id),
  );
  const seen = new Map<string, number>();
  const orderSeen = new Map<string, number>();
  const usedBy = new Map<string, Set<number>>();
  for (const id of new Set(reviewers.map((r) => r.id))) usedBy.set(id, await usedOrders(id, dataset));
  return Promise.all(
    rows.map(async (r, i) => {
      const problems: string[] = [];
      const orderRaw = pick(r, ["order", "order_no"]);
      const orderNo = /^\d+$/.test(orderRaw) ? Number(orderRaw) : null;
      if (orderNo === null) problems.push("order is missing or not a number");
      const reviewer = pick(r, ["reviewer", "email", "reviewer_email", "enumerator"]);
      const rl = reviewer.toLowerCase();
      const matches = reviewers.filter((p) => p.email.toLowerCase() === rl || (p.name ?? "").toLowerCase() === rl);
      if (matches.length === 0) problems.push("reviewer not found in the Narratives team");
      if (matches.length > 1) problems.push("reviewer name matches more than one person; use the email");
      const lesson = pick(r, ["video_id", "lesson", "lesson_id", "tr_id", "narrative"]);
      const n = all.find((x) => x.lessonId === lesson || x.code === lesson);
      if (!n) problems.push("no loaded narrative with that lesson id (tr_id) or N-code");
      else if (assigned.has(n.id)) problems.push("already assigned (use Reassign on the dashboard)");
      if (n) {
        if (seen.has(n.id)) problems.push(`the same narrative is on line ${seen.get(n.id)} too`);
        else seen.set(n.id, i + 2);
      }
      if (matches.length === 1 && orderNo !== null) {
        const key = `${matches[0].id}:${orderNo}`;
        if (usedBy.get(matches[0].id)?.has(orderNo)) problems.push(`this reviewer already has a Video ${orderNo}`);
        else if (orderSeen.has(key)) problems.push(`line ${orderSeen.get(key)} gives this reviewer Video ${orderNo} too`);
        else orderSeen.set(key, i + 2);
      }
      const linkRaw = pick(r, ["video_link", "video_url", "link", "video_drive_id"]);
      const videoUrl = linkRaw ? normaliseVideoLink(linkRaw) : null;
      if (linkRaw && !videoUrl) problems.push("video link is not an https link or Drive id");
      const sheetFile = pick(r, ["video_file", "video_filename", "file"]) || null;
      let video: VideoCheckResult | null = null;
      if (n && (!linkRaw || videoUrl)) {
        video = await checkVideo({ lessonId: n.lessonId, videoUrl, sheetFile, lookup });
        if (!video.ok) problems.push(video.problem);
      }
      return {
        line: i + 2,
        orderNo,
        reviewer,
        lesson,
        narrativeId: n?.id ?? null,
        narrativeCode: n?.code ?? null,
        lessonId: n?.lessonId ?? null,
        sid: n?.lessonId ? sidOf(n.lessonId) : null,
        assigneeId: matches.length === 1 ? matches[0].id : null,
        assigneeName: matches.length === 1 ? matches[0].name || matches[0].email : null,
        videoUrl,
        sheetFile,
        videoFile: video?.ok ? video.fileName : null,
        videoCheck: video?.ok ? video.method : null,
        videoNote: video?.ok && video.method === null ? video.note : null,
        problems,
      };
    }),
  );
}

export async function confirmAssignmentSheet(
  actorId: string,
  csv: string,
  lookup: DriveLookup | null = defaultDriveLookup(),
  dataset: Dataset = "live",
): Promise<Result<{ assigned: number; skipped: number }>> {
  const preview = await previewAssignmentSheet(csv, lookup, dataset);
  let assigned = 0;
  for (const row of preview) {
    if (row.problems.length || !row.narrativeId || !row.assigneeId || row.orderNo === null) continue;
    const r = await assignNarrative(
      actorId,
      {
        narrativeId: row.narrativeId,
        assigneeId: row.assigneeId,
        orderNo: row.orderNo,
        videoUrl: row.videoUrl,
        videoFile: row.sheetFile,
      },
      lookup,
    );
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
  sid: string | null;
  format: "script" | "narrative";
  durationLabel: string | null;
  episodes: number;
  importedAt: Date;
  assignmentId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  orderNo: number | null;
  videoUrl: string | null;
  videoFile: string | null;
  videoCheck: string | null;
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
      sid: n.lessonId ? sidOf(n.lessonId) : null,
      format: n.sourceFormat === SCRIPT_FORMAT ? "script" : "narrative",
      durationLabel: n.durationLabel,
      episodes: n.episodeCount,
      importedAt: n.importedAt,
      assignmentId: x?.a.id ?? null,
      assigneeId: x?.a.assigneeId ?? null,
      assigneeName: x ? x.name || x.email : null,
      orderNo: x?.a.orderNo ?? null,
      videoUrl: x?.a.videoUrl ?? null,
      videoFile: x?.a.videoFile ?? null,
      videoCheck: x?.a.videoCheck ?? null,
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
  sid: string | null;
  format: "script" | "narrative";
  practice: boolean;
  durationLabel: string | null;
  assigneeId: string;
  assigneeName: string;
  orderNo: number;
  videoUrl: string | null;
  videoFile: string | null;
  videoCheck: string | null;
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
    sid: row.n.lessonId ? sidOf(row.n.lessonId) : null,
    format: row.n.sourceFormat === SCRIPT_FORMAT ? "script" : "narrative",
    practice: row.n.dataset === "training",
    durationLabel: row.n.durationLabel,
    assigneeId: row.a.assigneeId,
    assigneeName: row.name || row.email,
    orderNo: row.a.orderNo,
    videoUrl: row.a.videoUrl,
    videoFile: row.a.videoFile,
    videoCheck: row.a.videoCheck,
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
  const filename = docxFilename(view.orderNo, view.lessonId ?? view.label, view.assigneeName, view.format === "script");
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
    ["file", "sid", "tr_id", "video_file", "video_link", "video_check", "format", "narrative_code", "reviewer", "order", "status", "version", "revision", "submitted_at", "active_minutes", "red_chars", "struck_chars", "comments", "original_words_removed", "sha256"],
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
      r.sid ?? "",
      r.lessonId ?? "",
      r.videoFile ?? "",
      r.videoUrl ?? "",
      r.videoCheck ?? "not checked",
      r.format,
      r.displayCode,
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
 *     narratives (with their lesson ids, Amendment §61), assignments (with
 *     the video file each was checked against),
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
      lessonId: narratives.lessonId,
      sourceFormat: narratives.sourceFormat,
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
