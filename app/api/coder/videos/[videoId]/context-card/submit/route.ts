/** POST /api/coder/videos/:videoId/context-card/submit — author only. */
import { NextResponse } from "next/server";
import { submitContextCard } from "@/lib/db/coder";
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
    const result = await submitContextCard(who.coderId, videoId);
    return NextResponse.json(result);
  } catch (e) {
    return coderErrorResponse(e);
  }
}
