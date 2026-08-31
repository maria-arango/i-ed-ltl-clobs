/**
 * POST /api/coder/calibration/:videoId/join — join the room, and the
 * heartbeat while in it. Creates the session (both observations must be
 * submitted), refreshes presence, opens the session on first co-presence,
 * and returns the room state.
 */
import { NextResponse } from "next/server";
import { joinCalibration } from "@/lib/db/coder-calibration";
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
    return NextResponse.json(await joinCalibration(who.coderId, videoId));
  } catch (e) {
    return coderErrorResponse(e);
  }
}
