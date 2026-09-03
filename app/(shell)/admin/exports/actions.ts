"use server";
/** Exports screen server action — admin re-checked on every call. */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { createExport } from "@/lib/db/admin-exports";

export interface ExportActionResult {
  ok: boolean;
  error?: string;
  exportId?: string;
  rows?: number;
}

export async function createExportAction(): Promise<ExportActionResult> {
  const session = await requireAdmin();
  try {
    const created = await createExport(session.user.id);
    revalidatePath("/admin/exports");
    return {
      ok: true,
      exportId: created.exportId,
      rows: Object.values(created.rowCounts).reduce((s, n) => s + n, 0),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The export could not be generated." };
  }
}
