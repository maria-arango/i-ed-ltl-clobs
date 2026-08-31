"use server";
/** Assignment screen server actions — admin re-checked on every call. */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  confirmWave,
  createPair,
  dissolvePair,
  previewWave,
  type WavePreview,
} from "@/lib/db/admin-assignment";

export interface PairActionResult {
  ok: boolean;
  error?: string;
}

export async function createPairAction(
  _prev: PairActionResult | null,
  formData: FormData,
): Promise<PairActionResult> {
  const session = await requireAdmin();
  const result = await createPair(
    session.user.id,
    String(formData.get("anchorId") ?? ""),
    String(formData.get("enumeratorId") ?? ""),
  );
  if (result.ok) revalidatePath("/admin/assignment");
  return result;
}

export async function dissolvePairAction(pairId: string): Promise<PairActionResult> {
  const session = await requireAdmin();
  const result = await dissolvePair(session.user.id, pairId);
  if (result.ok) revalidatePath("/admin/assignment");
  return result;
}

export interface WaveActionResult {
  ok: boolean;
  error?: string;
  preview?: WavePreview;
  confirmed?: { waveNo: number; assigned: number };
}

export async function previewWaveAction(
  _prev: WaveActionResult | null,
  formData: FormData,
): Promise<WaveActionResult> {
  await requireAdmin();
  const result = await previewWave(
    String(formData.get("seed") ?? ""),
    String(formData.get("weekStart") ?? ""),
    Number(formData.get("waveDays")),
  );
  return result.ok ? { ok: true, preview: result.preview } : { ok: false, error: result.error };
}

export async function confirmWaveAction(
  _prev: WaveActionResult | null,
  formData: FormData,
): Promise<WaveActionResult> {
  const session = await requireAdmin();
  const result = await confirmWave(
    session.user.id,
    String(formData.get("seed") ?? ""),
    String(formData.get("weekStart") ?? ""),
    Number(formData.get("waveDays")),
    String(formData.get("hash") ?? ""),
  );
  if (result.ok) {
    revalidatePath("/admin/assignment");
    revalidatePath("/");
    return { ok: true, confirmed: { waveNo: result.waveNo, assigned: result.assigned } };
  }
  return { ok: false, error: result.error };
}

export interface RotationActionResult {
  ok: boolean;
  error?: string;
  preview?: import("@/lib/db/admin-assignment").RotationPreview;
  confirmed?: { formed: number };
}

export async function previewRotationAction(
  _prev: RotationActionResult | null,
  formData: FormData,
): Promise<RotationActionResult> {
  await requireAdmin();
  const { previewRotation } = await import("@/lib/db/admin-assignment");
  const result = await previewRotation(String(formData.get("seed") ?? ""));
  return result.ok ? { ok: true, preview: result.preview } : { ok: false, error: result.error };
}

export async function confirmRotationAction(
  _prev: RotationActionResult | null,
  formData: FormData,
): Promise<RotationActionResult> {
  const session = await requireAdmin();
  const { confirmRotation } = await import("@/lib/db/admin-assignment");
  const result = await confirmRotation(
    session.user.id,
    String(formData.get("seed") ?? ""),
    String(formData.get("hash") ?? ""),
  );
  if (result.ok) {
    revalidatePath("/admin/assignment");
    return { ok: true, confirmed: { formed: result.formed } };
  }
  return { ok: false, error: result.error };
}

export interface WeekPlanActionResult {
  ok: boolean;
  error?: string;
  changed?: number;
}

/** Save the week plan: who works that week and at how many videos/day. */
export async function setWeekPlanAction(
  _prev: WeekPlanActionResult | null,
  formData: FormData,
): Promise<WeekPlanActionResult> {
  const session = await requireAdmin();
  const { setWeekPlan } = await import("@/lib/db/admin-assignment");
  let entries: Array<{ userId: string; videosPerDay: number }>;
  try {
    entries = JSON.parse(String(formData.get("entries") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the plan." };
  }
  const result = await setWeekPlan(
    session.user.id,
    String(formData.get("weekStart") ?? ""),
    String(formData.get("weekEnd") ?? ""),
    entries,
  );
  if (result.ok) {
    revalidatePath("/admin/assignment");
    return { ok: true, changed: result.changed };
  }
  return result;
}
