"use client";
/**
 * Sign-in (ADR 0003, Amendment §60) on the original page and flow. After the
 * email, the page asks the server which second step applies:
 *  - admins, and accounts without an assigned code: the emailed 6-digit code
 *    (as before ADR 0003);
 *  - everyone else (unknown emails included): their 4-digit code.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import DottedSurface from "@/components/ui/dotted-surface";
import { SignInPage } from "@/components/ui/sign-in-flow-1";

const MESSAGES: Record<string, string> = {
  invalid: "That email and code do not match. Go back to check the email, or try the code again.",
  locked: "Too many wrong codes. This account is locked for a while; try again later or ask a coordinator.",
  hard_locked: "This account is locked after too many wrong codes. Ask a coordinator to unlock it.",
  throttled: "Too many attempts from this connection. Wait 15 minutes and try again.",
  error: "Something went wrong. Check your connection and try again.",
};

export function PinSignInClient() {
  const router = useRouter();
  const email = useRef("");
  const [mode, setMode] = useState<"pin" | "email-code">("pin");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const submitEmail = async (value: string) => {
    email.current = value.trim().toLowerCase();
    setEmailError(null);
    setCodeError(null);
    const res = await fetch("/api/signin-method", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.current }),
    }).catch(() => null);
    const method = res?.ok ? ((await res.json()) as { method: string }).method : "pin";
    if (method === "email-code") {
      const sent = await signIn("email-code", { email: email.current, redirect: false });
      if (sent?.error) {
        setEmailError("That email is not on the team list. Ask an admin to add you, or check the spelling.");
        return false;
      }
      setMode("email-code");
      return true;
    }
    setMode("pin");
    return true;
  };

  const verify = async (code: string) => {
    setCodeError(null);
    if (mode === "email-code") {
      // Auth.js verifies email one-time tokens on its GET callback endpoint.
      const params = new URLSearchParams({ email: email.current, token: code, callbackUrl: "/" });
      const res = await fetch(`/api/auth/callback/email-code?${params}`, { redirect: "follow" });
      if (res.url.includes("error=")) {
        setCodeError("That code is wrong or has expired. Try again or go back to send a new one.");
        return false;
      }
      return true;
    }
    const res = await fetch("/api/pin-signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.current, pin: code }),
    }).catch(() => null);
    if (res?.ok) return true;
    const body = (await res?.json().catch(() => null)) as { reason?: string; lockedUntil?: string } | null;
    let msg = MESSAGES[body?.reason ?? "error"] ?? MESSAGES.error;
    if (body?.lockedUntil) {
      msg += ` Try again after ${new Date(body.lockedUntil).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`;
    }
    setCodeError(msg);
    return false;
  };

  return (
    <>
      <DottedSurface />
      <SignInPage
        mode={mode}
        subtitle="Sign in with your email"
        onSubmitEmail={submitEmail}
        onVerifyCode={verify}
        onContinue={() => {
          router.replace("/");
          router.refresh();
        }}
        emailError={emailError}
        codeError={codeError}
      />
    </>
  );
}
