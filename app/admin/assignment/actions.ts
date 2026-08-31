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
    Number(formData.get("videosPerPair")),
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
    Number(formData.get("videosPerPair")),
    String(formData.get("hash") ?? ""),
  );
  if (result.ok) {
    revalidatePath("/admin/assignment");
    revalidatePath("/");
    return { ok: true, confirmed: { waveNo: result.waveNo, assigned: result.assigned } };
  }
  return { ok: false, error: result.error };
}
