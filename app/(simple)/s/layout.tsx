/**
 * The SIMPLE interface (docs/08 §3, Amendment §46): an ODK-style frame for
 * phones and tablets. One column, big type, big tap targets, a slim bar
 * with the person and sign-out. Same design tokens, same restricted data
 * layer, same blinding rules as the full interface — only the arrangement
 * changes. Coders on desktops with mode 'simple' get it too.
 */
import Link from "next/link";
import { signOut } from "@/auth";
import { requireSession } from "@/lib/auth-helpers";

export default async function SimpleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const name = session.user.name ?? session.user.email ?? "";
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-hairline bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[640px] items-center justify-between gap-3 px-4 py-3">
          <Link href="/s" className="font-serif text-[17px] leading-none text-ink">
            LTL Classroom Observations
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden truncate text-[13px] text-smoke sm:inline">{name}</span>
            {session.user.role === "admin" && (
              <Link href="/" className="rounded-sm text-[13px] text-lake underline underline-offset-4">
                Full view
              </Link>
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button
                type="submit"
                className="rounded-md border border-hairline-strong bg-paper px-3 py-2 text-[13px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[640px] px-4 pb-24 pt-5">{children}</main>
    </div>
  );
}
