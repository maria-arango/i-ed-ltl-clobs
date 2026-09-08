/**
 * POST /api/coder/videos/:videoId/start — "Do you want to start this
 * video?" → yes (Amendment §45). Takes the coder's single video lock and
 * opens the observation. 423 while another video is locked.
 */
import { NextResponse } from "next/server";
import { startVideo } from "@/lib/db/coder";
import { coderErrorResponse, isResponse, isUuid, requireCoder } from "@/lib/coder-route";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!isUuid(videoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(await startVideo(who.coderId, videoId));
  } catch (e) {
    return coderErrorResponse(e);
  }
}
