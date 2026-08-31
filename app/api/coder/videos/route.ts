/**
 * GET /api/coder/videos — the acting coder's own queue.
 * Coder-facing: uses ONLY the restricted query layer (lib/db/coder).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCoderQueue } from "@/lib/db/coder";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const queue = await getCoderQueue(session.user.id);
  return NextResponse.json({ videos: queue });
}
