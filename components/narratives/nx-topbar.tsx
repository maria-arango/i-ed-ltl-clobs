/**
 * The Narratives area's frame: product name, the tabs this person may use,
 * and — always visible — who is signed in, with Sign out. On lent devices
 * the name on screen is how people notice they are in someone else's
 * account (Amendment §53).
 */
import Link from "next/link";
import { signOut } from "@/auth";
import { canAccessNarratives, canAccessScoring, type Role, type Team } from "@/lib/teams";
import { NxTabs, type NxTab } from "./nx-tabs";

export function tabsFor(role: Role, teams: readonly Team[]): NxTab[] {
  const tabs: NxTab[] = [];
  if (role === "admin") {
    tabs.push({ href: "/admin/narratives", label: "Narratives" });
    if (teams.includes("narratives")) tabs.push({ href: "/narratives", label: "My narratives" });
    tabs.push({ href: "/scoring", label: "Scoring" });
    tabs.push({ href: "/admin/team", label: "Team" });
    return tabs;
  }
  if (canAccessNarratives(role, teams)) tabs.push({ href: "/narratives", label: "Narratives" });
  if (teams.length > 0 && canAccessScoring(role, teams)) tabs.push({ href: "/scoring", label: "Scoring" });
  return tabs;
}

export function NxTopbar({
  displayName,
  role,
  teams,
}: {
  displayName: string;
  role: Role;
  teams: readonly Team[];
}) {
  return (
    <header className="border-b border-nx-border bg-nx-surface">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4 sm:px-6">
        <span className="whitespace-nowrap text-[15px] font-semibold text-nx-text">
          LTL Classroom Observations
        </span>
        <NxTabs tabs={tabsFor(role, teams)} />
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[14px] text-nx-muted sm:inline">
            Signed in as <strong className="font-semibold text-nx-text">{displayName}</strong>
          </span>
          <Link href="/account" className="hidden text-[14px] text-nx-accent hover:underline sm:inline">
            Change PIN
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-nx-border-strong bg-nx-surface px-3 py-1.5 text-[14px] font-medium text-nx-text hover:bg-nx-sunken"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
      <p className="border-t border-nx-border px-4 py-1.5 text-[13px] text-nx-muted sm:hidden">
        Signed in as <strong className="font-semibold text-nx-text">{displayName}</strong>
      </p>
    </header>
  );
}
