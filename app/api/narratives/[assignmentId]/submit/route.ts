/**
 * POST /api/narratives/:assignmentId/submit { baseRevision } — submit the
 * revision the enumerator is looking at. Refused (409 not_synced) while the
 * device still has unsaved changes, so what is submitted is what they saw.
 */
import { NextResponse } from "next/server";
import { submitMyNarrative } from "@/lib/db/narratives";
import { isUuid, notFound, requireNarrativeEnumerator } from "@/lib/narratives-route";

type Params = { params: Promise<{ assignmentId: string }> };

export async function POST(req: Request, { params }: Params) {
  const who = await requireNarrativeEnumerator();
  if (who instanceof NextResponse) return who;
  const { assignmentId } = await params;
  if (!isUuid(assignmentId)) return notFound();
  const body = (await req.json().catch(() => null)) as { baseRevision?: unknown } | null;
  const base = Number(body?.baseRevision);
  if (!Number.isInteger(base)) return NextResponse.json({ error: "baseRevision is required" }, { status: 400 });
  const r = await submitMyNarrative(who, assignmentId, base);
  if (r.ok) return NextResponse.json({ submittedAt: r.submittedAt });
  if (r.reason === "not_found") return notFound();
  if (r.reason === "already_submitted") return NextResponse.json({ error: "Already submitted", code: "submitted" }, { status: 423 });
  return NextResponse.json({ error: "Unsaved changes on this device", code: "not_synced" }, { status: 409 });
}
