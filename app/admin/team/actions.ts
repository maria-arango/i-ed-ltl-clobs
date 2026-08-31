"use server";
/**
 * Team screen server actions. Every action re-checks the admin session
 * server-side (enforcement is never UI-only) and revalidates the page.
 */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  addTeamMember,
  setChiefCoder,
  setMemberActive,
} from "@/lib/db/admin";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function addMemberAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin();
  const role = formData.get("role") === "admin" ? "admin" : "coder";
  const result = await addTeamMember(session.user.id, {
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? "") || null,
    role,
    isChiefCoder: formData.get("chief") === "on",
    isTrainee: formData.get("trainee") === "on",
  });
  if (result.ok) revalidatePath("/admin/team");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function setActiveAction(
  userId: string,
  active: boolean,
): Promise<ActionResult> {
  const session = await requireAdmin();
  const result = await setMemberActive(session.user.id, userId, active);
  if (result.ok) revalidatePath("/admin/team");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function setChiefAction(
  userId: string,
  isChief: boolean,
): Promise<ActionResult> {
  const session = await requireAdmin();
  const result = await setChiefCoder(session.user.id, userId, isChief);
  if (result.ok) revalidatePath("/admin/team");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
