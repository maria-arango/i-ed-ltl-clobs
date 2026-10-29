"use client";
/**
 * Everyday sign-in (Amendment §53, ADR 0003): the original sign-in flow
 * (same page, same steps, same look) with the person's own 4-digit code as
 * the second step. The email step never reveals whether an account exists;
 * the code step answers neutrally.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DottedSurface from "@/components/ui/dotted-surface";
import { SignInPage } from "@/components/ui/sign-in-flow-1";

const MESSAGES: Record<string, string> = {
  invalid: "That email and code do not match. Go back to check the email, or try the code again.",
  locked: "Too many wrong codes. This account is locked for a while; try again later or ask a coordinator.",
  hard_locked: "This account is locked after too many wrong codes. Ask a coordinator for a new code.",
  throttled: "Too many attempts from this connection. Wait 15 minutes and try again.",
  error: "Something went wrong. Check your connection and try again.",
};

export function PinSignInClient() {
  const router = useRouter();
  const email = useRef("");
  const [codeError, setCodeError] = useState<string | null>(null);

  return (
    <>
      <DottedSurface />
      <SignInPage
        mode="pin"
        onSubmitEmail={(value) => {
          email.current = value.trim().toLowerCase();
          setCodeError(null);
          return true;
        }}
        onVerifyCode={async (pin) => {
          setCodeError(null);
          const res = await fetch("/api/pin-signin", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: email.current, pin }),
          }).catch(() => null);
          if (res?.ok) return true;
          const body = (await res?.json().catch(() => null)) as { reason?: string; lockedUntil?: string } | null;
          let msg = MESSAGES[body?.reason ?? "error"] ?? MESSAGES.error;
          if (body?.lockedUntil) {
            msg += ` Try again after ${new Date(body.lockedUntil).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`;
          }
          setCodeError(msg);
          return false;
        }}
        onContinue={() => {
          router.replace("/");
          router.refresh();
        }}
        codeError={codeError}
        footer={
          <p className="text-[13px] text-smoke">
            Coordinators can also{" "}
            <Link href="/signin/email" className="rounded-sm text-lake underline underline-offset-4">
              sign in with an email code
            </Link>
            .
          </p>
        }
      />
    </>
  );
}
