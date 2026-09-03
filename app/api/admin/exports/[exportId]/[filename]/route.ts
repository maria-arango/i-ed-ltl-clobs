/**
 * Serve one stored export file (or the whole bundle as `bundle.zip`) to an
 * ADMIN. The bytes come from storage, never regenerated; every download is
 * audited. Non-admins get 403 — this is an API, so no redirect.
 */
import { auth } from "@/auth";
import { getExportBundle, getExportFile } from "@/lib/db/admin-exports";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ exportId: string; filename: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Sign in required", { status: 401 });
  if (session.user.role !== "admin") return new Response("Admins only", { status: 403 });

  const { exportId, filename } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(exportId) || !/^[A-Za-z0-9_.-]+$/.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  if (filename === "bundle.zip") {
    const bundle = await getExportBundle(session.user.id, exportId);
    if (!bundle) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(bundle.bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${bundle.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const file = await getExportFile(session.user.id, exportId, filename);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
