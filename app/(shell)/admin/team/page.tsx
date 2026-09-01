/**
 * Team — who can sign in, and as what (admin-only). Deactivation blocks
 * sign-in but preserves every piece of work (nothing is destructive);
 * every change lands in the audit log. Weekly availability is planned on
 * the Assignment screen (Amendment B §25), not here.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listTeam } from "@/lib/db/admin";
import { listPendingRequests } from "@/lib/db/admin-access";
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
import { RequestActions } from "./request-actions";

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
  const [team, requests] = await Promise.all([listTeam(), listPendingRequests()]);
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
        <p className="text-[15px] text-graphite">
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

      {requests.length > 0 && (
        <section aria-label="Access requests" className="space-y-3">
          <h2
            className="font-sans font-medium text-ink"
            style={{
              fontSize: "var(--clobs-text-heading-sm)",
              lineHeight: "var(--clobs-leading-heading-sm)",
              letterSpacing: "var(--clobs-tracking-heading-sm)",
            }}
          >
            Access requests
            <span
              className="badge-pop mono ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 align-middle text-[11px] font-semibold"
              style={{ background: "var(--clobs-lake)", color: "var(--clobs-paper)" }}
            >
              {requests.length}
            </span>
          </h2>
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-ink">{r.fullName}</TableCell>
                  <TableCell className="mono text-[13px] text-graphite">{r.email}</TableCell>
                  <TableCell className="text-[13px] text-graphite">
                    {r.requestedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </TableCell>
                  <TableCell className="text-right">
                    <RequestActions requestId={r.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

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
