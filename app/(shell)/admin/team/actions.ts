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

export async function setRoleAction(
  userId: string,
  role: "admin" | "coder",
): Promise<ActionResult> {
  const session = await requireAdmin();
  const { setMemberRole } = await import("@/lib/db/admin");
  const result = await setMemberRole(session.user.id, userId, role);
  if (result.ok) revalidatePath("/admin/team");
  return result;
}

export async function deleteMemberAction(userId: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const { deleteMemberPermanently } = await import("@/lib/db/admin");
  const result = await deleteMemberPermanently(session.user.id, userId);
  if (result.ok) revalidatePath("/admin/team");
  return result;
}

// Availability is planned per week on the Assignment screen (Amendment B
// §25); the per-member editor that lived here was removed with it.

export async function decideRequestAction(
  requestId: string,
  decision: "approved_training" | "approved_live" | "declined",
): Promise<ActionResult> {
  const session = await requireAdmin();
  const { decideAccessRequest } = await import("@/lib/db/admin-access");
  const result = await decideAccessRequest(session.user.id, requestId, decision);
  if (result.ok) {
    revalidatePath("/admin/team");
    revalidatePath("/admin/training");
  }
  return result;
}
