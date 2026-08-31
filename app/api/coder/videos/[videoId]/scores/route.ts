/**
 * PUT /api/coder/videos/:videoId/scores — upsert one item's score:
 * { itemNo: 1–8, scoreNum: 1–4, justification?: string }.
 * Refused with 409 once the observation is submitted (scores are locked).
 */
import { NextResponse } from "next/server";
import { saveScore } from "@/lib/db/coder";
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

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const justification =
    body.justification == null ? null : String(body.justification);

  try {
    const saved = await saveScore(who.coderId, videoId, who.dataset, {
      itemNo: Number(body.itemNo),
      scoreNum: Number(body.scoreNum),
      justification,
    });
    return NextResponse.json(saved);
  } catch (e) {
    if (e instanceof Error && /Invalid score number/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return coderErrorResponse(e);
  }
}
