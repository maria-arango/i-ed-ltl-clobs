/**
 * POST /api/signin-method { email } → { method: "email-code" | "pin" }
 * Tells the sign-in page which second step to show (Amendment §60): admins
 * and accounts without an assigned code get the emailed 6-digit code;
 * everyone else, including unknown emails, the 4-digit code step.
 */
import { NextResponse } from "next/server";
import { signInMethodFor } from "@/lib/db/pin-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.slice(0, 320) : "";
  return NextResponse.json({ method: await signInMethodFor(email) });
}
