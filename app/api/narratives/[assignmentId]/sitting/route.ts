/**
 * POST /api/narratives/:assignmentId/sitting { end?, storagePersisted? } —
 * heartbeat while the editor is open (measured time, Amendment §52); `end`
 * closes the sitting (sent with sendBeacon when the page is hidden).
 */
import { NextResponse } from "next/server";
import { touchSitting } from "@/lib/db/narratives";
import { classifyDevice } from "@/lib/device";
import { isUuid, notFound, requireNarrativeEnumerator } from "@/lib/narratives-route";

type Params = { params: Promise<{ assignmentId: string }> };

export async function POST(req: Request, { params }: Params) {
  const who = await requireNarrativeEnumerator();
  if (who instanceof NextResponse) return who;
  const { assignmentId } = await params;
  if (!isUuid(assignmentId)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { end?: unknown; storagePersisted?: unknown; viewport?: unknown };
  const r = await touchSitting(who, assignmentId, {
    device: classifyDevice(req.headers.get("user-agent"), typeof body.viewport === "number" ? body.viewport : null),
    storagePersisted: typeof body.storagePersisted === "boolean" ? body.storagePersisted : null,
    end: body.end === true,
  });
  return r.ok ? NextResponse.json({ ok: true }) : notFound();
}
