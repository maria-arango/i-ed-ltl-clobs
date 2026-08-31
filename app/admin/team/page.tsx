/**
 * Team — who can sign in, and as what (admin-only). Deactivation blocks
 * sign-in but preserves every piece of work (nothing is destructive);
 * every change lands in the audit log.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getAvailabilityMap, listTeam } from "@/lib/db/admin";
import { AppShell } from "@/components/app-shell";
import { AddMemberForm } from "./add-member-form";
import { AvailabilityCell } from "./availability-cell";
import { MemberRowActions } from "./member-row-actions";

function RoleChip({
  role,
  isChiefCoder,
  datasetScope,
}: {
  role: string;
  isChiefCoder: boolean;
  datasetScope: string;
}) {
  const label =
    datasetScope === "training"
      ? "trainee"
      : role === "admin"
        ? "admin"
        : isChiefCoder
          ? "chief coder"
          : "coder";
  const styles: Record<string, { bg: string; fg: string }> = {
    admin: { bg: "var(--clobs-lake-wash)", fg: "var(--clobs-lake)" },
    "chief coder": { bg: "var(--clobs-forest-wash)", fg: "var(--clobs-forest)" },
    coder: { bg: "var(--clobs-sunken)", fg: "var(--clobs-graphite)" },
    trainee: { bg: "var(--clobs-sunken)", fg: "var(--clobs-smoke)" },
  };
  const s = styles[label];
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {label}
    </span>
  );
}

export default async function TeamPage() {
  const session = await requireAdmin();
  const [team, availability] = await Promise.all([listTeam(), getAvailabilityMap()]);
  const visible = team.filter((m) => !m.email.endsWith("@example.invalid"));

  return (
    <AppShell
      email={session.user.email}
      role={session.user.role}
      isChiefCoder={session.user.isChiefCoder}
    >
      <div className="mx-auto mt-2 max-w-[880px] space-y-10">
        <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
          <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
            Home
          </Link>
          <span aria-hidden> / </span>
          <span className="text-graphite">Team</span>
        </nav>

        <section className="space-y-1">
          <h1
            className="font-serif text-ink"
            style={{
              fontSize: "var(--clobs-text-display)",
              lineHeight: "var(--clobs-leading-display)",
              letterSpacing: "var(--clobs-tracking-display)",
            }}
          >
            Team
          </h1>
          <p className="max-w-[68ch] text-[15px] text-graphite">
            Everyone who can sign in, and how much time they can give.
            Deactivating blocks sign-in but keeps all work. Deleting is only
            possible for accounts with nothing on record. Every change lands
            in the audit log.
          </p>
        </section>

        <AddMemberForm />

        <section aria-label="Team members">
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead>
                <tr className="bg-sunken text-[12px] text-graphite">
                  <th className="px-4 py-2 font-semibold">Person</th>
                  <th className="px-4 py-2 font-semibold">Email</th>
                  <th className="px-4 py-2 font-semibold">Role</th>
                  <th className="px-4 py-2 font-semibold">Availability</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr
                    key={m.id}
                    className={`h-11 border-t border-hairline ${m.isActive ? "" : "opacity-60"}`}
                  >
                    <td className="px-4 text-ink">{m.name ?? ""}</td>
                    <td className="mono px-4 text-[13px] text-graphite">{m.email}</td>
                    <td className="px-4">
                      <RoleChip
                        role={m.role}
                        isChiefCoder={m.isChiefCoder}
                        datasetScope={m.datasetScope}
                      />
                    </td>
                    <td className="px-4">
                      <AvailabilityCell
                        userId={m.id}
                        current={
                          availability[m.id]
                            ? {
                                videosPerDay: availability[m.id].videosPerDay,
                                effectiveFrom: availability[m.id].effectiveFrom.toISOString(),
                                effectiveTo:
                                  availability[m.id].effectiveTo?.toISOString() ?? null,
                              }
                            : null
                        }
                      />
                    </td>
                    <td className="px-4 text-[13px] text-graphite">
                      {m.isActive ? "Active" : "Deactivated"}
                    </td>
                    <td className="px-4 text-right">
                      <MemberRowActions
                        userId={m.id}
                        role={m.role}
                        isChiefCoder={m.isChiefCoder}
                        isActive={m.isActive}
                        isSelf={m.id === session.user.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
