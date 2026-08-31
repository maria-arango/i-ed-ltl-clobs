/**
 * POST /api/coder/videos/:videoId/submit — submit the observation.
 * Requires all 8 items scored; sets submitted status and LOCKS the scores
 * (application check + database trigger).
 */
import { NextResponse } from "next/server";
import { submitObservation } from "@/lib/db/coder";
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
    const result = await submitObservation(who.coderId, videoId);
    return NextResponse.json(result);
  } catch (e) {
    return coderErrorResponse(e);
  }
}
