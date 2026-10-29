/**
 * Sign-in: email + personal 4-digit PIN (Amendment §53, ADR 0003).
 * The email-code sign-in remains at /signin/email for admins.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PinSignIn } from "./pin-signin";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  return (
    <div className="nx-area flex min-h-screen flex-col">
      <header className="border-b border-nx-border bg-nx-surface">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center px-4 sm:px-6">
          <Link href="/" className="text-[15px] font-semibold">
            LTL Classroom Observations
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-[400px] rounded-md border border-nx-border bg-nx-surface p-6">
          <h1 className="text-[22px] font-semibold">Sign in</h1>
          <p className="mt-1 mb-5 text-[14px] text-nx-muted">Use your email and the PIN the coordinators gave you.</p>
          <PinSignIn />
        </div>
      </main>
      <footer className="border-t border-nx-border bg-nx-surface">
        <p className="mx-auto max-w-[1100px] px-4 py-4 text-[13px] text-nx-muted sm:px-6">
          Forgot your PIN? Ask a coordinator for a new one. Coordinators can also{" "}
          <Link href="/signin/email" className="text-nx-accent underline">
            sign in with an email code
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
