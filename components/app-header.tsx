/** The quiet top bar: wordmark, account, sign out. Server component. */
import Link from "next/link";
import { signOut } from "@/auth";

export function AppHeader({
  email,
  role,
  isChiefCoder,
}: {
  email: string | null | undefined;
  role: string;
  isChiefCoder: boolean;
}) {
  return (
    <header className="flex items-center justify-between border-b border-hairline pb-4">
      <Link href="/" className="rounded-sm font-serif text-[20px] text-ink">
        LTL Classroom Observations
      </Link>
      <div className="flex items-center gap-4">
        <span className="hidden text-[13px] text-smoke sm:inline">
          {email} · {role}
          {isChiefCoder ? " · chief coder" : ""}
        </span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-hairline-strong bg-paper px-4 py-2 text-[13px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
