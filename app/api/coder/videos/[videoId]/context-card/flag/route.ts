/**
 * POST /api/coder/videos/:videoId/context-card/flag — the second-pass
 * flag (Amendment A): the non-author reports a problem with the card,
 * with a required reason; the author can then revise and resubmit.
 */
import { NextResponse } from "next/server";
import { flagContextCard } from "@/lib/db/coder";
import {
  coderErrorResponse,
  isResponse,
  isUuid,
  requireCoder,
} from "@/lib/coder-route";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!isUuid(videoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let reason = "";
  try {
    const body = await req.json();
    if (typeof body.reason === "string") reason = body.reason;
  } catch {
    /* handled by the layer's empty-reason check */
  }
  try {
    return NextResponse.json(await flagContextCard(who.coderId, videoId, reason));
  } catch (e) {
    return coderErrorResponse(e);
  }
}
