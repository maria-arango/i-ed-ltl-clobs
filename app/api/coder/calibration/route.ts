/**
 * GET /api/coder/calibration — the coder's calibration queue: every shared
 * video with its stage (code first / waiting for partner / ready / done).
 * Display codes and stages only; never anyone's scores.
 */
import { NextResponse } from "next/server";
import { getCalibrationQueue } from "@/lib/db/coder-calibration";
import { coderErrorResponse, isResponse, requireCoder } from "@/lib/coder-route";

export async function GET() {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  try {
    const queue = await getCalibrationQueue(who.coderId);
    return NextResponse.json({ queue });
  } catch (e) {
    return coderErrorResponse(e);
  }
}
