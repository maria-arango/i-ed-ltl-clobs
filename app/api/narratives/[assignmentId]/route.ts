/**
 * GET /api/narratives/:assignmentId — the current server copy of one of the
 * acting enumerator's narratives (used to reload after a conflict). Another
 * person's assignment is a 404, indistinguishable from none.
 */
import { NextResponse } from "next/server";
import { getMyNarrative } from "@/lib/db/narratives";
import { isUuid, notFound, requireNarrativeEnumerator } from "@/lib/narratives-route";

type Params = { params: Promise<{ assignmentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const who = await requireNarrativeEnumerator();
  if (who instanceof NextResponse) return who;
  const { assignmentId } = await params;
  if (!isUuid(assignmentId)) return notFound();
  const n = await getMyNarrative(who.id, assignmentId);
  if (!n) return notFound();
  return NextResponse.json(n);
}
