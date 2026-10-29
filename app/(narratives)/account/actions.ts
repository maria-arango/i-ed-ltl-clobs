"use server";
import { requireSession } from "@/lib/auth-helpers";
import { changeOwnPin } from "@/lib/db/pin-auth";

export async function changePinAction(current: string, next: string, repeat: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (next !== repeat) return { ok: false, error: "The two new codes are not the same." };
  return changeOwnPin(session.user.id, String(current), String(next));
}
