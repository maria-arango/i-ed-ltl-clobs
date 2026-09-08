/**
 * Which coder interface to serve (docs/08 §3, Amendment §46).
 *   account preference 'simple' | 'full'  → that
 *   'auto'                                 → simple on phone/tablet, full on desktop
 * Admins are never auto-redirected: they use "Preview as" to see the
 * simple interface. Pure.
 */
import type { DeviceKind } from "@/lib/device";

export type UiMode = "auto" | "simple" | "full";
export type ResolvedUiMode = "simple" | "full";

export function resolveUiMode(pref: UiMode | null | undefined, device: DeviceKind): ResolvedUiMode {
  if (pref === "simple" || pref === "full") return pref;
  return device === "phone" || device === "tablet" ? "simple" : "full";
}
