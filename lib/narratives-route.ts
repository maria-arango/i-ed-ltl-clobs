/**
 * Shared plumbing for the enumerator Narratives API: session (401) and
 * Narratives-team (403) checks, enforced on every request (Amendment §51).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveTeams } from "@/lib/db/teams";
import { getDisplayName } from "@/lib/db/narratives";
import { canAccessNarratives } from "@/lib/teams";

export interface NarrativeActor {
  id: string;
  name: string;
}

export async function requireNarrativeEnumerator(): Promise<NarrativeActor | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in", code: "signed_out" }, { status: 401 });
  }
  const teams = await getActiveTeams(session.user.id);
  if (!canAccessNarratives(session.user.role, teams)) {
    return NextResponse.json({ error: "This account has no access to narratives", code: "no_narratives_access" }, { status: 403 });
  }
  return { id: session.user.id, name: await getDisplayName(session.user.id) };
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
