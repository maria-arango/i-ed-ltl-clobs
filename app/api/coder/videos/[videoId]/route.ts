/**
 * GET /api/coder/videos/:videoId — one assigned video's workspace:
 * the video, the coder's own observation/notes/scores, and the context
 * card under the Amendment A rule. A video that is not actively assigned
 * to the acting coder is a 404, indistinguishable from one that does not
 * exist. Coder-facing: uses ONLY the restricted query layer (lib/db/coder).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWorkspace } from "@/lib/db/coder";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(videoId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const workspace = await getWorkspace(session.user.id, videoId);
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(workspace);
}
