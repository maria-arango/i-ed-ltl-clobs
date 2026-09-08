/**
 * Timed sections (Amendment §44).
 *   POST { section, viewportWidth?, resumeReason? } → open a sitting
 *        (428 + code resume_reason_required when the last sitting did not
 *        end with a submission and no reason was given yet)
 *   PUT  { sessionId, action: "heartbeat" | "end" }
 * The device is classified server-side from the user agent + the reported
 * viewport width, never trusted from the client as a label.
 */
import { NextResponse } from "next/server";
import { endSection, heartbeatSection, startSection, type SectionKind } from "@/lib/db/coder";
import { classifyDevice } from "@/lib/device";
import { coderErrorResponse, isResponse, isUuid, requireCoder } from "@/lib/coder-route";

const SECTIONS: SectionKind[] = ["context_card", "notes", "scores"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!isUuid(videoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { section?: string; viewportWidth?: number; resumeReason?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }
  if (!SECTIONS.includes(body.section as SectionKind)) {
    return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  }
  const device = classifyDevice(req.headers.get("user-agent"), body.viewportWidth);
  try {
    return NextResponse.json(
      await startSection(who.coderId, videoId, body.section as SectionKind, device, body.resumeReason ?? null),
    );
  } catch (e) {
    return coderErrorResponse(e);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!isUuid(videoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { sessionId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }
  if (!body.sessionId || !isUuid(body.sessionId)) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  try {
    if (body.action === "heartbeat") {
      return NextResponse.json(await heartbeatSection(who.coderId, body.sessionId));
    }
    if (body.action === "end") {
      return NextResponse.json(await endSection(who.coderId, body.sessionId));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return coderErrorResponse(e);
  }
}
