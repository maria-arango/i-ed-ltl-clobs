import Link from "next/link";
import { requireSession } from "@/lib/auth-helpers";
import { signOut } from "@/auth";

export default async function Home() {
  const session = await requireSession();
  const { user } = session;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper p-8">
      <h1
        className="font-serif text-ink"
        style={{
          fontSize: "var(--clobs-text-display)",
          lineHeight: "var(--clobs-leading-display)",
          letterSpacing: "var(--clobs-tracking-display)",
        }}
      >
        LTL CLOBS
      </h1>
      <p className="max-w-prose text-center text-graphite">
        Signed in as <span className="font-medium text-ink">{user.email}</span>{" "}
        ({user.role}
        {user.isChiefCoder ? ", chief coder" : ""}). The coding workspace
        arrives in build stage 2.
      </p>
      <div className="flex items-center gap-6">
        <Link
          href="/styleguide"
          className="rounded-md px-1 text-lake underline underline-offset-4"
        >
          Style guide
        </Link>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[15px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
