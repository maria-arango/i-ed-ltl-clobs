/**
 * POST /api/coder/calibration/:videoId/leave — mark this coder as out of
 * the room (fired on page unload, best-effort).
 */
import { NextResponse } from "next/server";
import { leaveCalibration } from "@/lib/db/coder-calibration";
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
    await leaveCalibration(who.coderId, videoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return coderErrorResponse(e);
  }
}
