/**
 * GET /api/admin/narratives/bundle?which=submitted|all[&since=24h] — every
 * submitted (or assigned) narrative as .docx in one .zip, with MANIFEST.csv;
 * `since=24h` keeps only those submitted in the last 24 hours.
 * Admins only; audited.
 */
import { auth } from "@/auth";
import { buildNarrativesZip } from "@/lib/db/admin-narratives";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Sign in required", { status: 401 });
  if (session.user.role !== "admin") return new Response("Admins only", { status: 403 });
  const params = new URL(req.url).searchParams;
  const which = params.get("which") === "all" ? "all" : "submitted";
  const since = params.get("since") === "24h" ? new Date(Date.now() - 24 * 3600 * 1000) : undefined;
  const zip = await buildNarrativesZip(session.user.id, which, "live", since);
  return new Response(new Uint8Array(zip.bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
