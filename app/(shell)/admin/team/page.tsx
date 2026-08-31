/**
 * Team — who can sign in, and as what (admin-only). Deactivation blocks
 * sign-in but preserves every piece of work (nothing is destructive);
 * every change lands in the audit log. Weekly availability is planned on
 * the Assignment screen (Amendment B §25), not here.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listTeam } from "@/lib/db/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddMemberForm } from "./add-member-form";
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
      className="inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {label}
    </span>
  );
}

export default async function TeamPage() {
  const session = await requireAdmin();
  const team = await listTeam();
  const visible = team.filter((m) => !m.email.endsWith("@example.invalid"));

  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-10">
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
          Everyone who can sign in, and as what. Deactivating blocks sign-in
          but keeps all work; deleting is only possible for accounts with
          nothing on record. Weekly availability lives on the{" "}
          <Link
            href="/admin/assignment"
            className="rounded-sm text-lake underline underline-offset-4"
          >
            Assignment screen
          </Link>
          .
        </p>
      </section>

      <AddMemberForm />

      <section aria-label="Team members">
        <Table>
          <TableHeader>
            <TableRow header>
              <TableHead>Person</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((m) => (
              <TableRow key={m.id} className={m.isActive ? "" : "opacity-60"}>
                <TableCell className="text-ink">{m.name ?? ""}</TableCell>
                <TableCell className="mono text-[13px] text-graphite">
                  {m.email}
                </TableCell>
                <TableCell>
                  <RoleChip
                    role={m.role}
                    isChiefCoder={m.isChiefCoder}
                    datasetScope={m.datasetScope}
                  />
                </TableCell>
                <TableCell className="text-[13px] text-graphite">
                  {m.isActive ? "Active" : "Deactivated"}
                </TableCell>
                <TableCell className="text-right">
                  <MemberRowActions
                    userId={m.id}
                    role={m.role}
                    isChiefCoder={m.isChiefCoder}
                    isActive={m.isActive}
                    isSelf={m.id === session.user.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
