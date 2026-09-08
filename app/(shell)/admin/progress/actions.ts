"use server";
/** Progress screen server actions — admin re-checked on every call. */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { releaseVideoLock } from "@/lib/db/admin-progress";

export async function releaseLockAction(
  lockId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  const r = await releaseVideoLock(session.user.id, lockId, reason);
  if (r.ok) revalidatePath("/admin/progress");
  return r;
}
