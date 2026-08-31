/**
 * POST /api/coder/videos/:videoId/context-card/confirm — the second-pass
 * confirmation (Amendment A): the non-author, after submitting their own
 * scores, confirms the partner's card as accurate.
 */
import { NextResponse } from "next/server";
import { confirmContextCard } from "@/lib/db/coder";
import {
  coderErrorResponse,
  isResponse,
  isUuid,
  requireCoder,
} from "@/lib/coder-route";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!isUuid(videoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(await confirmContextCard(who.coderId, videoId));
  } catch (e) {
    return coderErrorResponse(e);
  }
}
