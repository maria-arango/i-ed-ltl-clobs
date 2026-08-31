/**
 * PUT /api/coder/videos/:videoId/context-card — save the card (assigned
 * filler only, draft only). Body: the general fields + adults[1..6].
 */
import { NextResponse } from "next/server";
import { saveContextCard, type ContextCardInput } from "@/lib/db/coder";
import {
  coderErrorResponse,
  isResponse,
  isUuid,
  requireCoder,
} from "@/lib/coder-route";

const COMPOSITIONS = new Set(["all_boys", "all_girls", "mixed"]);
const ADULT_ROLES = new Set(["teacher", "camera_operator", "other"]);
const SEXES = new Set(["male", "female", "unknown"]);
const SPEAKS = new Set(["yes", "no"]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function oneOf<T extends string>(v: unknown, allowed: Set<string>): T | null {
  return typeof v === "string" && allowed.has(v) ? (v as T) : null;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const who = await requireCoder();
  if (isResponse(who)) return who;
  const { videoId } = await params;
  if (!isUuid(videoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const adultsRaw = Array.isArray(body.adults) ? body.adults : [];
  const input: ContextCardInput = {
    subject: str(body.subject),
    composition: oneOf<"all_boys" | "all_girls" | "mixed">(
      body.composition,
      COMPOSITIONS,
    ),
    approxCount: str(body.approxCount),
    uniforms: str(body.uniforms),
    appearanceCaveats: str(body.appearanceCaveats),
    room: str(body.room),
    camera: str(body.camera),
    notes: str(body.notes),
    timeline: str(body.timeline),
    settingChange: str(body.settingChange),
    adults: adultsRaw.map((a: Record<string, unknown>) => ({
      adultNo: Number(a.adultNo),
      role: oneOf<"teacher" | "camera_operator" | "other">(a.role, ADULT_ROLES),
      sex: oneOf<"male" | "female" | "unknown">(a.sex, SEXES),
      clothing: str(a.clothing),
      clothingCaveats: str(a.clothingCaveats),
      features: str(a.features),
      behavior: str(a.behavior),
      speaks: oneOf<"yes" | "no">(a.speaks, SPEAKS),
    })),
  };

  try {
    const result = await saveContextCard(who.coderId, videoId, who.dataset, input);
    return NextResponse.json(result);
  } catch (e) {
    return coderErrorResponse(e);
  }
}
