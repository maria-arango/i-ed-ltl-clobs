/**
 * PUT    /api/coder/videos/:videoId/notes — create ({body, videoTimestampSeconds?})
 *        or update ({noteId, body, videoTimestampSeconds?}) one of the
 *        coder's OWN notes. Timestamps are optional (Amendment B §15).
 * DELETE /api/coder/videos/:videoId/notes — soft-delete ({noteId}).
 */
import { NextResponse } from "next/server";
import { deleteNote, saveNote } from "@/lib/db/coder";
import {
  coderErrorResponse,
  isResponse,
  isUuid,
  requireCoder,
} from "@/lib/coder-route";

type Params = { params: Promise<{ videoId: string }> };

export async function PUT(req: Request, { params }: Params) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!isUuid(videoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.body !== "string") {
    return NextResponse.json({ error: "body (string) is required" }, { status: 400 });
  }
  const ts =
    body.videoTimestampSeconds == null ? null : Number(body.videoTimestampSeconds);
  if (ts !== null && (!Number.isInteger(ts) || ts < 0 || ts > 24 * 3600)) {
    return NextResponse.json(
      { error: "videoTimestampSeconds must be a non-negative integer" },
      { status: 400 },
    );
  }
  try {
    const note = await saveNote(who.coderId, videoId, who.dataset, {
      noteId: typeof body.noteId === "string" ? body.noteId : undefined,
      body: body.body,
      videoTimestampSeconds: ts,
    });
    return NextResponse.json(note);
  } catch (e) {
    return coderErrorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  const body = await req.json().catch(() => null);
  if (!isUuid(videoId) || !body || !isUuid(body.noteId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await deleteNote(who.coderId, videoId, who.dataset, body.noteId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return coderErrorResponse(e);
  }
}
