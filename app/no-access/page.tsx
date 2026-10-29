/** Signed in, but this account's teams have nothing in the platform yet. */
import { requireSession } from "@/lib/auth-helpers";
import { signOut } from "@/auth";

export default async function NoAccess() {
  const session = await requireSession();
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="elev-card w-full max-w-md rounded-2xl border border-hairline bg-paper p-8">
        <h1
          className="font-serif text-ink"
          style={{
            fontSize: "var(--clobs-text-heading)",
            lineHeight: "var(--clobs-leading-heading)",
            letterSpacing: "var(--clobs-tracking-heading)",
          }}
        >
          Nothing to do here yet
        </h1>
        <p className="mt-3 text-[15px] text-graphite">
          You are signed in as <span className="font-medium text-ink">{session.user.name || session.user.email}</span>,
          but your team does not work in this platform at the moment. If you think this is a mistake, contact the
          study coordinators.
        </p>
        <form
          className="mt-6"
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
    </div>
  );
}
