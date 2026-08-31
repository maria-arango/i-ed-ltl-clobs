/**
 * POST /api/coder/calibration/:videoId/signoff — sign the calibration.
 * Records who, when, and from where (addendum §7). The second signature
 * completes the session, assignment and video; the record is then
 * immutable (migration 0005 triggers).
 */
import { NextResponse } from "next/server";
import { signOffCalibration } from "@/lib/db/coder-calibration";
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
  try {
    const result = await signOffCalibration(who.coderId, videoId, {
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json(result);
  } catch (e) {
    return coderErrorResponse(e);
  }
}
