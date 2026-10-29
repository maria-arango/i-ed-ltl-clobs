/**
 * Sign-in — the first screen of the platform (the original Kimanya page).
 * Everyday sign-in is email + the person's own 4-digit code (ADR 0003); the
 * emailed-code sign-in remains at /signin/email.
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInLayout } from "./signin-layout";
import { PinSignInClient } from "./pin-signin";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  return (
    <SignInLayout>
      <PinSignInClient />
    </SignInLayout>
  );
}
