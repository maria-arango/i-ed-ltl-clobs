/**
 * POST /api/coder/videos/:videoId/problem { reason } — "Problem with this
 * video" (Amendment §48): records the reason for admins, releases the
 * coder's lock, closes their open sittings. Nothing is deleted.
 */
import { NextResponse } from "next/server";
import { reportVideoProblem } from "@/lib/db/coder";
import { coderErrorResponse, isResponse, isUuid, requireCoder } from "@/lib/coder-route";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!isUuid(videoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }
  try {
    return NextResponse.json(await reportVideoProblem(who.coderId, videoId, String(body.reason ?? "")));
  } catch (e) {
    return coderErrorResponse(e);
  }
}
