/**
 * GET /api/admin/narratives/:assignmentId/docx — one narrative as Word
 * (the submitted version when submitted). Admins only; audited.
 */
import { auth } from "@/auth";
import { buildNarrativeDocx } from "@/lib/db/admin-narratives";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ assignmentId: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Sign in required", { status: 401 });
  if (session.user.role !== "admin") return new Response("Admins only", { status: 403 });
  const { assignmentId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) return new Response("Not found", { status: 404 });
  const file = await buildNarrativeDocx(session.user.id, assignmentId);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
