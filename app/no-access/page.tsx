/** Signed in, but this account's teams have nothing in the platform yet. */
import { requireSession } from "@/lib/auth-helpers";
import { signOut } from "@/auth";

export default async function NoAccess() {
  const session = await requireSession();
  return (
    <div className="nx-area flex min-h-screen items-center justify-center px-4">
      <div className="max-w-[520px] rounded-md border border-nx-border bg-nx-surface p-6">
        <h1 className="text-[20px] font-semibold">Nothing to do here yet</h1>
        <p className="mt-2 text-[15px] text-nx-muted">
          You are signed in as <strong className="text-nx-text">{session.user.name || session.user.email}</strong>,
          but your team does not work in this platform at the moment. If you think this is a
          mistake, contact the study coordinators.
        </p>
        <form
          className="mt-5"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-nx-border-strong px-3 py-1.5 text-[14px] font-medium hover:bg-nx-sunken"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
