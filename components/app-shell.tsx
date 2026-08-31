/**
 * The application frame: icon sidebar (app navigation) + a slim top bar
 * with the account and sign-out, wrapping every working screen.
 */
import { signOut } from "@/auth";
import { AppSidebar, type SidebarBadges } from "@/components/app-sidebar";

export function AppShell({
  email,
  role,
  isChiefCoder,
  badges,
  children,
}: {
  email: string | null | undefined;
  role: string;
  isChiefCoder: boolean;
  badges?: SidebarBadges;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper md:flex-row">
      <AppSidebar isAdmin={role === "admin"} badges={badges} />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-end gap-4 border-b border-hairline px-8 py-3">
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
        </header>
        <main className="mx-auto max-w-[1200px] p-8">{children}</main>
      </div>
    </div>
  );
}
