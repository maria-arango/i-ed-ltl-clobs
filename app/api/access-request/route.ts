/**
 * POST /api/access-request — the PUBLIC "request permission to enter"
 * endpoint (Amendment §35). Creates a pending request only; never an
 * account. Responds identically whatever happened, so nobody can probe
 * which emails exist. A honeypot field silently discards bots.
 */
import { NextResponse } from "next/server";
import { submitAccessRequest } from "@/lib/db/admin-access";

export async function POST(req: Request) {
  let body: { fullName?: unknown; email?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  // Honeypot: real people never fill the invisible "website" field.
  if (typeof body.website === "string" && body.website !== "") {
    return NextResponse.json({ ok: true });
  }
  if (typeof body.fullName === "string" && typeof body.email === "string") {
    await submitAccessRequest(body.fullName, body.email).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
