/**
 * PUT /api/narratives/:assignmentId/document — save the working copy
 * (ADR 0002). Body: { baseRevision, clientId, doc, answers, comments },
 * optionally gzip-compressed (header x-body-encoding: gzip).
 *
 *   200 { revision, savedAt }        applied
 *   409 { serverRevision }           stale base: refused, kept as conflict copy
 *   423                              submitted: read-only, kept as conflict copy
 *   401 / 403 / 404 / 400 / 413
 */
import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { saveMyNarrative } from "@/lib/db/narratives";
import { isUuid, notFound, requireNarrativeEnumerator } from "@/lib/narratives-route";

type Params = { params: Promise<{ assignmentId: string }> };

const MAX_BODY = 8 * 1024 * 1024;

async function readBody(req: Request): Promise<unknown | "too_large" | null> {
  const raw = Buffer.from(await req.arrayBuffer());
  let buf = raw;
  if (req.headers.get("x-body-encoding") === "gzip") {
    try {
      buf = gunzipSync(raw, { maxOutputLength: MAX_BODY });
    } catch {
      return null;
    }
  }
  if (buf.length > MAX_BODY) return "too_large";
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

export async function PUT(req: Request, { params }: Params) {
  const who = await requireNarrativeEnumerator();
  if (who instanceof NextResponse) return who;
  const { assignmentId } = await params;
  if (!isUuid(assignmentId)) return notFound();
  const body = await readBody(req);
  if (body === "too_large") return NextResponse.json({ error: "Document too large" }, { status: 413 });
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const b = body as Record<string, unknown>;
  const r = await saveMyNarrative(who, assignmentId, {
    baseRevision: Number(b.baseRevision),
    clientId: String(b.clientId ?? ""),
    doc: b.doc,
    answers: b.answers ?? {},
    comments: b.comments ?? [],
  });
  if (r.ok) return NextResponse.json({ revision: r.revision, savedAt: r.savedAt });
  switch (r.reason) {
    case "conflict":
      return NextResponse.json({ error: "Changed elsewhere", code: "conflict", serverRevision: r.serverRevision }, { status: 409 });
    case "submitted":
      return NextResponse.json({ error: "Submitted and read-only", code: "submitted" }, { status: 423 });
    case "not_found":
      return notFound();
    case "invalid":
      return NextResponse.json({ error: r.error, code: "invalid" }, { status: 400 });
  }
}
