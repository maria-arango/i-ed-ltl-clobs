/** GET /api/narratives — the acting enumerator's assigned narratives, in order. */
import { NextResponse } from "next/server";
import { listMyNarratives } from "@/lib/db/narratives";
import { requireNarrativeEnumerator } from "@/lib/narratives-route";

export async function GET() {
  const who = await requireNarrativeEnumerator();
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ narratives: await listMyNarratives(who.id) });
}
