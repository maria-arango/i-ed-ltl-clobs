/**
 * GET /api/admin/narratives/bundle?which=submitted|all — every submitted
 * (or assigned) narrative as .docx in one .zip, with MANIFEST.csv.
 * Admins only; audited.
 */
import { auth } from "@/auth";
import { buildNarrativesZip } from "@/lib/db/admin-narratives";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Sign in required", { status: 401 });
  if (session.user.role !== "admin") return new Response("Admins only", { status: 403 });
  const which = new URL(req.url).searchParams.get("which") === "all" ? "all" : "submitted";
  const zip = await buildNarrativesZip(session.user.id, which);
  return new Response(new Uint8Array(zip.bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
