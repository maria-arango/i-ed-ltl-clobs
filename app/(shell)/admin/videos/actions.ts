"use server";
/** Video-library server actions (Drive-link attachment) — admin only. */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  attachSingleLink,
  confirmDriveLinks,
  previewDriveLinks,
  type DriveLinkPreview,
} from "@/lib/db/admin-videos";

export interface LinkPreviewResult {
  ok: boolean;
  error?: string;
  preview?: DriveLinkPreview;
}

export async function previewLinksAction(
  _prev: LinkPreviewResult | null,
  formData: FormData,
): Promise<LinkPreviewResult> {
  await requireAdmin();
  const text = String(formData.get("lines") ?? "");
  if (!text.trim()) return { ok: false, error: "Paste at least one line first." };
  return { ok: true, preview: await previewDriveLinks(text) };
}

export interface LinkConfirmResult {
  ok: boolean;
  error?: string;
  attached?: number;
}

export async function confirmLinksAction(
  links: Array<{ videoId: string; url: string }>,
): Promise<LinkConfirmResult> {
  const session = await requireAdmin();
  const result = await confirmDriveLinks(session.user.id, links);
  if (result.ok) {
    revalidatePath("/admin/videos");
    return { ok: true, attached: result.attached };
  }
  return result;
}

export interface SingleAttachResult {
  ok: boolean;
  error?: string;
  displayCode?: string;
}

export async function attachSingleAction(
  _prev: SingleAttachResult | null,
  formData: FormData,
): Promise<SingleAttachResult> {
  const session = await requireAdmin();
  const result = await attachSingleLink(
    session.user.id,
    String(formData.get("displayCode") ?? ""),
    String(formData.get("url") ?? ""),
  );
  if (result.ok) revalidatePath("/admin/videos");
  return result;
}
