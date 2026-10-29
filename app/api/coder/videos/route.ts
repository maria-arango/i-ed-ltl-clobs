/**
 * GET /api/coder/videos — the acting coder's own queue.
 * Coder-facing: uses ONLY the restricted query layer (lib/db/coder).
 */
import { NextResponse } from "next/server";
import { isResponse, requireCoder } from "@/lib/coder-route";
import { getCoderQueue } from "@/lib/db/coder";

export async function GET() {
  // Session + scoring-team check (Amendment §50).
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const queue = await getCoderQueue(who.coderId);
  return NextResponse.json({ videos: queue });
}
