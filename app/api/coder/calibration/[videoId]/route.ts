/**
 * GET /api/coder/calibration/:videoId — current room state. Partner data
 * appears in the payload only once the session is open/completed; the gate
 * lives in lib/db/coder-calibration.ts, not here.
 */
import { NextResponse } from "next/server";
import { getCalibrationRoom } from "@/lib/db/coder-calibration";
import {
  coderErrorResponse,
  isResponse,
  isUuid,
  requireCoder,
} from "@/lib/coder-route";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!isUuid(videoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(await getCalibrationRoom(who.coderId, videoId));
  } catch (e) {
    return coderErrorResponse(e);
  }
}
