"use server";
/** Training space server actions — admin re-checked on every call. */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { addTrainee, assignTrainingPack } from "@/lib/db/admin-training";

export interface TrainingActionResult {
  ok: boolean;
  error?: string;
  assigned?: number;
}

export async function addTraineeAction(
  _prev: TrainingActionResult | null,
  formData: FormData,
): Promise<TrainingActionResult> {
  const session = await requireAdmin();
  const result = await addTrainee(
    session.user.id,
    String(formData.get("email") ?? ""),
    String(formData.get("name") ?? "") || null,
  );
  if (result.ok) revalidatePath("/admin/training");
  return result;
}

export async function assignPackAction(userId: string): Promise<TrainingActionResult> {
  const session = await requireAdmin();
  const result = await assignTrainingPack(session.user.id, userId);
  if (result.ok) revalidatePath("/admin/training");
  return result;
}

/** The sandbox: hand the acting ADMIN the training pack themselves. */
export async function enterSandboxAction(): Promise<TrainingActionResult> {
  const session = await requireAdmin();
  const result = await assignTrainingPack(session.user.id, session.user.id);
  if (result.ok) {
    revalidatePath("/admin/training");
    revalidatePath("/videos");
    revalidatePath("/");
  }
  return result;
}
