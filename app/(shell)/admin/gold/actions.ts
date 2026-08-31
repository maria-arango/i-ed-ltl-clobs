"use server";
/** Gold set + certification server actions — admin re-checked every call. */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  decideCertification,
  saveGoldScores,
  searchGoldCandidates,
  setGoldFlag,
} from "@/lib/db/admin-gold";

export interface GoldActionResult {
  ok: boolean;
  error?: string;
}

export interface GoldSearchResult {
  ok: boolean;
  error?: string;
  results?: Array<{
    videoId: string;
    displayCode: string;
    rawFilename: string;
    isGold: boolean;
  }>;
}

export async function searchGoldAction(
  _prev: GoldSearchResult | null,
  formData: FormData,
): Promise<GoldSearchResult> {
  await requireAdmin();
  const q = String(formData.get("q") ?? "");
  if (q.trim().length < 3) {
    return { ok: false, error: "Type at least 3 characters of the filename or code." };
  }
  return { ok: true, results: await searchGoldCandidates(q) };
}

export async function setGoldAction(
  videoId: string,
  isGold: boolean,
): Promise<GoldActionResult> {
  const session = await requireAdmin();
  const result = await setGoldFlag(session.user.id, videoId, isGold);
  if (result.ok) revalidatePath("/admin/gold");
  return result;
}

export async function saveGoldScoresAction(
  videoId: string,
  items: Array<{ itemNo: number; scoreNum: number; rationale: string | null }>,
): Promise<GoldActionResult> {
  const session = await requireAdmin();
  const result = await saveGoldScores(session.user.id, videoId, items);
  if (result.ok) {
    revalidatePath("/admin/gold");
    revalidatePath(`/admin/gold/${videoId}`);
  }
  return result;
}

export async function certifyAction(
  userId: string,
  decision: "passed" | "failed",
): Promise<GoldActionResult> {
  const session = await requireAdmin();
  const result = await decideCertification(session.user.id, userId, decision);
  if (result.ok) {
    revalidatePath("/admin/gold");
    revalidatePath("/admin/team");
  }
  return result;
}
