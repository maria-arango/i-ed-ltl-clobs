/**
 * Shared plumbing for coder-facing route handlers: session check, dataset
 * scope from the account (never the client), and CoderError → HTTP mapping.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { CoderError, type Dataset } from "@/lib/db/coder";

export interface CoderIdentity {
  coderId: string;
  dataset: Dataset;
}

export async function requireCoder(): Promise<CoderIdentity | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return {
    coderId: session.user.id,
    dataset: session.user.datasetScope,
  };
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

export function coderErrorResponse(e: unknown): NextResponse {
  if (e instanceof CoderError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof Error && /locked since/.test(e.message)) {
    // The database trigger refused a change to a locked score.
    return NextResponse.json(
      { error: "Scores are locked after submission" },
      { status: 409 },
    );
  }
  throw e;
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}
