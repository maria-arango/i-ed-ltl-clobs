"use server";
/**
 * Narratives dashboard server actions. Every action re-checks the admin
 * session server-side; inputs are validated in lib/db/admin-narratives.
 */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  assignNarrative,
  confirmAssignmentSheet,
  confirmNarrativeImport,
  previewAssignmentSheet,
  previewNarrativeImport,
  reassignNarrative,
  reopenNarrative,
  restoreRevision,
  runNightlyBackup,
  updateNarrativeAssignment,
  voidNarrative,
  type ImportFile,
  type ImportPreviewRow,
  type SheetRowPreview,
} from "@/lib/db/admin-narratives";

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const MAX_BATCH_FILES = 40;

function files(input: unknown): ImportFile[] | null {
  if (!Array.isArray(input) || input.length > MAX_BATCH_FILES) return null;
  const out: ImportFile[] = [];
  for (const f of input) {
    if (!f || typeof f.name !== "string" || typeof f.text !== "string") return null;
    out.push({ name: f.name.slice(0, 200), text: f.text });
  }
  return out;
}

const refresh = (assignmentId?: string) => {
  revalidatePath("/admin/narratives");
  if (assignmentId) revalidatePath(`/admin/narratives/${assignmentId}`);
};

export async function previewImportAction(batch: ImportFile[]): Promise<ImportPreviewRow[] | { error: string }> {
  await requireAdmin();
  const f = files(batch);
  if (!f) return { error: "Invalid upload." };
  return previewNarrativeImport(f);
}

/**
 * Lesson IDs are ALWAYS removed (Amendment §57): the platform stores none.
 * The code ↔ lesson list is returned once so the admin can keep it in the
 * Harvard Drive; it is not saved here.
 */
export async function confirmImportAction(
  batch: ImportFile[],
): Promise<ActionResult & { codes?: Array<{ displayCode: string; lessonId: string; file: string }> }> {
  const session = await requireAdmin();
  const f = files(batch);
  if (!f) return { ok: false, error: "Invalid upload." };
  const r = await confirmNarrativeImport(session.user.id, f, { removeLessonIds: true });
  refresh();
  return r.ok
    ? {
        ok: true,
        message: `${r.created.length} loaded, ${r.skipped} skipped.`,
        codes: r.created.map(({ displayCode, lessonId, file }) => ({ displayCode, lessonId, file })),
      }
    : { ok: false, error: r.error };
}

/** "Copy to the Harvard Drive now" — the nightly copy, on demand (§58). */
export async function backupNowAction(): Promise<ActionResult> {
  const session = await requireAdmin();
  const r = await runNightlyBackup({
    actorId: session.user.id,
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    folderId: process.env.DRIVE_BACKUP_FOLDER_ID,
  });
  return r.ok
    ? { ok: true, message: `Copied ${r.files.length} files to the Drive folder (${r.files.map((x) => x.name).join(", ")}).` }
    : { ok: false, error: r.error };
}

export async function previewSheetAction(csv: string): Promise<SheetRowPreview[]> {
  await requireAdmin();
  return previewAssignmentSheet(String(csv).slice(0, 500_000));
}

export async function confirmSheetAction(csv: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const r = await confirmAssignmentSheet(session.user.id, String(csv).slice(0, 500_000));
  refresh();
  return r.ok ? { ok: true, message: `${r.assigned} assigned, ${r.skipped} skipped.` } : { ok: false, error: r.error };
}

export async function assignAction(narrativeId: string, assigneeId: string, orderNo: number, videoUrl: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const r = await assignNarrative(session.user.id, { narrativeId, assigneeId, orderNo: Number(orderNo), videoUrl: videoUrl || null });
  refresh();
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function updateAssignmentAction(assignmentId: string, orderNo: number, videoUrl: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const r = await updateNarrativeAssignment(session.user.id, assignmentId, { orderNo: Number(orderNo), videoUrl: videoUrl || null });
  refresh(assignmentId);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function reassignAction(assignmentId: string, assigneeId: string, reason: string): Promise<ActionResult & { assignmentId?: string }> {
  const session = await requireAdmin();
  const r = await reassignNarrative(session.user.id, assignmentId, { assigneeId, reason: String(reason) });
  refresh(assignmentId);
  return r.ok ? { ok: true, assignmentId: r.assignmentId } : { ok: false, error: r.error };
}

export async function reopenAction(assignmentId: string, reason: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const r = await reopenNarrative(session.user.id, assignmentId, String(reason));
  refresh(assignmentId);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function restoreAction(assignmentId: string, revisionId: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const r = await restoreRevision(session.user.id, assignmentId, revisionId);
  refresh(assignmentId);
  return r.ok ? { ok: true, message: `Restored as version ${r.revision}.` } : { ok: false, error: r.error };
}

export async function voidAction(narrativeId: string, reason: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const r = await voidNarrative(session.user.id, narrativeId, String(reason));
  refresh();
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
