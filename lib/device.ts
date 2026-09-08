/**
 * Device classification (docs/08 §3.2, Amendment §44): phone / tablet /
 * desktop from the browser's user agent plus, when the client reports it,
 * the viewport width. Recorded on every section sitting so time-on-task
 * can be compared across devices; Phase 3 also uses it to pick the simple
 * layout. Pure.
 */
export type DeviceKind = "phone" | "tablet" | "desktop" | "unknown";

export function classifyDevice(userAgent: string | null | undefined, viewportWidth?: number | null): DeviceKind {
  const ua = (userAgent ?? "").toLowerCase();
  const width = typeof viewportWidth === "number" && viewportWidth > 0 ? viewportWidth : null;

  const isIpad = /ipad/.test(ua) || (/macintosh/.test(ua) && /mobile/.test(ua));
  const isAndroidTablet = /android/.test(ua) && !/mobile/.test(ua);
  const isPhone = /iphone|ipod|windows phone/.test(ua) || (/android/.test(ua) && /mobile/.test(ua));

  if (isIpad || isAndroidTablet || /tablet|kindle|silk|playbook/.test(ua)) {
    return width !== null && width < 600 ? "phone" : "tablet";
  }
  if (isPhone) return width !== null && width >= 900 ? "tablet" : "phone";
  if (/mobi/.test(ua)) return "phone";
  if (width !== null) {
    if (width < 600) return "phone";
    if (width < 1100) return "tablet";
    return "desktop";
  }
  return ua ? "desktop" : "unknown";
}
