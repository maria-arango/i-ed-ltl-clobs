/**
 * Email-code sign-in (ADR 0001), kept as the coordinators' fallback since
 * ADR 0003 made email + 4-digit code the everyday sign-in at /signin.
 */
import { SignInLayout } from "../signin-layout";
import { SignInClient } from "../signin-client";

export default function EmailSignInPage() {
  return (
    <SignInLayout>
      <SignInClient />
    </SignInLayout>
  );
}
