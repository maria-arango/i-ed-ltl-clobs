/**
 * GET /api/coder/videos/:videoId — one assigned video's workspace:
 * the video, the coder's own observation/notes/scores, and the context
 * card under the Amendment A rule. A video that is not actively assigned
 * to the acting coder is a 404, indistinguishable from one that does not
 * exist. Coder-facing: uses ONLY the restricted query layer (lib/db/coder).
 */
import { NextResponse } from "next/server";
import { isResponse, requireCoder } from "@/lib/coder-route";
import { getWorkspace } from "@/lib/db/coder";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  // Session + scoring-team check (Amendment §50).
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(videoId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const workspace = await getWorkspace(who.coderId, videoId);
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(workspace);
}
