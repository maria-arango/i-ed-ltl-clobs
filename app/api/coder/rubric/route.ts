/**
 * GET /api/coder/rubric — the active rubric version's full content plus
 * the context-card field help. Reference data, coder-readable.
 */
import { NextResponse } from "next/server";
import { getRubricContent } from "@/lib/db/coder";
import { isResponse, requireCoder } from "@/lib/coder-route";

export async function GET() {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const rubric = await getRubricContent();
  if (!rubric) {
    return NextResponse.json({ error: "No rubric seeded" }, { status: 500 });
  }
  return NextResponse.json(rubric);
}
