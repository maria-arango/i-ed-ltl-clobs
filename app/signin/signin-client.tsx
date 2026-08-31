"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import DottedSurface from "@/components/ui/dotted-surface";
import { SignInPage } from "@/components/ui/sign-in-flow-1";

export function SignInClient() {
  const router = useRouter();
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState("");

  const handleSubmitEmail = async (email: string) => {
    setEmailError(null);
    const normalized = email.trim().toLowerCase();
    const res = await signIn("email-code", {
      email: normalized,
      redirect: false,
    });
    if (res?.error) {
      setEmailError(
        "That email is not on the team list. Ask an admin to add you, or check the spelling.",
      );
      return false;
    }
    setCurrentEmail(normalized);
    return true;
  };

  const handleVerifyCode = async (code: string) => {
    setCodeError(null);
    // Auth.js verifies email one-time tokens on its GET callback endpoint;
    // following the redirect chain tells us whether a session was created.
    const params = new URLSearchParams({
      email: currentEmail,
      token: code,
      callbackUrl: "/",
    });
    const res = await fetch(`/api/auth/callback/email-code?${params}`, {
      redirect: "follow",
    });
    if (res.url.includes("error=")) {
      setCodeError("That code is wrong or has expired. Try again or resend.");
      return false;
    }
    return true;
  };

  return (
    <>
      <DottedSurface />
      <SignInPage
        onSubmitEmail={handleSubmitEmail}
        onVerifyCode={handleVerifyCode}
        onContinue={() => {
          router.push("/");
          router.refresh();
        }}
        emailError={emailError}
        codeError={codeError}
      />
    </>
  );
}
