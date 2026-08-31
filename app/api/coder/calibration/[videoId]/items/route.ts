/**
 * PUT /api/coder/calibration/:videoId/items — save/revise one consensus
 * item while the session is open. Body: { itemNo, finalScoreNum, rationale }.
 * The resolution (who moved) is computed server-side from the locked
 * individual scores; the score triple is constructed from lib/score.ts.
 */
import { NextResponse } from "next/server";
import { saveConsensusItem } from "@/lib/db/coder-calibration";
import {
  coderErrorResponse,
  isResponse,
  isUuid,
  requireCoder,
} from "@/lib/coder-route";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!isUuid(videoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { itemNo?: unknown; finalScoreNum?: unknown; rationale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.itemNo !== "number" || typeof body.finalScoreNum !== "number") {
    return NextResponse.json(
      { error: "itemNo and finalScoreNum are required" },
      { status: 400 },
    );
  }
  try {
    const result = await saveConsensusItem(who.coderId, videoId, {
      itemNo: body.itemNo,
      finalScoreNum: body.finalScoreNum,
      rationale: typeof body.rationale === "string" ? body.rationale : null,
    });
    return NextResponse.json(result);
  } catch (e) {
    return coderErrorResponse(e);
  }
}
