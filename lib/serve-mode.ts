/**
 * Server-side: which interface this request should get (Amendment §46).
 * Reads the account preference from the session and classifies the device
 * from the request's user agent. Admins are never redirected automatically
 * (they preview the simple interface from the Team screen).
 */
import { headers } from "next/headers";
import { classifyDevice, type DeviceKind } from "@/lib/device";
import { resolveUiMode, type ResolvedUiMode, type UiMode } from "@/lib/ui-mode";

export async function requestDevice(): Promise<DeviceKind> {
  const h = await headers();
  // Chromium sends a viewport hint on some requests; the UA is the fallback.
  const width = Number(h.get("sec-ch-viewport-width") ?? h.get("viewport-width") ?? "");
  return classifyDevice(h.get("user-agent"), Number.isFinite(width) && width > 0 ? width : null);
}

export async function resolvedModeFor(user: {
  role: string;
  uiMode?: UiMode | null;
}): Promise<{ mode: ResolvedUiMode; device: DeviceKind; autoRedirect: boolean }> {
  const device = await requestDevice();
  const mode = resolveUiMode(user.uiMode ?? "auto", device);
  return { mode, device, autoRedirect: user.role !== "admin" };
}
