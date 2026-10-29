/**
 * POST /api/pin-signin { email, pin } — email + PIN sign-in (ADR 0003).
 * On success sets the Auth.js session cookie for a database session
 * created in lib/db/pin-auth.ts; every failure answers without revealing
 * whether the email has an account.
 */
import { NextResponse } from "next/server";
import { signInWithPin } from "@/lib/db/pin-auth";
import { SESSION_ABSOLUTE_MS } from "@/lib/pin";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; pin?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.slice(0, 320) : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const r = await signInWithPin({ email, pin, ip: clientIp(req) });
  if (!r.ok) {
    const status = r.reason === "throttled" ? 429 : r.reason === "invalid" ? 401 : 423;
    return NextResponse.json({ reason: r.reason, lockedUntil: r.lockedUntil?.toISOString() }, { status });
  }
  const secure =
    new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const res = NextResponse.json({ ok: true });
  // The same cookie Auth.js reads for database sessions.
  res.cookies.set(secure ? "__Secure-authjs.session-token" : "authjs.session-token", r.sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_ABSOLUTE_MS / 1000,
  });
  return res;
}
