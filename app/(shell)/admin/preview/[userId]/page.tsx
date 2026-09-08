/**
 * "Preview as coder" (Amendment §42; replaces the María-only "What Arya can
 * see"): a read-only mirror of one account's queues, for ANY admin and ANY
 * account. It reads through the same restricted coder layer that person's
 * session uses, so it can never show more than their account could obtain.
 * The blinding boundary holds by construction. Nothing here writes.
 *
 * Phase 3 of docs/08 adds the simple/advanced layout switch to this page.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { getCoderQueue } from "@/lib/db/coder";
import { getCalibrationQueue } from "@/lib/db/coder-calibration";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function PreviewAsCoderPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();

  const [person] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      datasetScope: users.datasetScope,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!person) notFound();

  const label = person.name ?? person.email;
  const [queue, calibration] = await Promise.all([
    getCoderQueue(person.id),
    person.datasetScope === "training" ? Promise.resolve([]) : getCalibrationQueue(person.id),
  ]);

  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-8">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <Link href="/admin/team" className="rounded-sm text-lake underline underline-offset-4">
          Team
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">Preview as {label}</span>
      </nav>

      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13px]"
        style={{ borderColor: "var(--clobs-lake)", background: "var(--clobs-lake-wash)", color: "var(--clobs-ink)" }}
      >
        <span>
          Previewing as <strong>{label}</strong>. Read-only: nothing you do here is saved, and
          this page can only show what their account can obtain.
        </span>
        <span className="text-graphite">
          {person.datasetScope === "training" ? "trainee" : person.role}
          {person.isActive ? "" : " · deactivated"}
        </span>
      </div>

      <section className="space-y-1">
        <h1
          className="font-serif text-ink"
          style={{
            fontSize: "var(--clobs-text-display)",
            lineHeight: "var(--clobs-leading-display)",
            letterSpacing: "var(--clobs-tracking-display)",
          }}
        >
          What {label} can see
        </h1>
        <p className="text-[15px] text-graphite">
          Their My videos queue and calibration queue, fetched through the
          restricted coder layer: display codes, their own progress, partner
          names, calibration stages. School, arm and teacher never appear here
          because that layer cannot read them.
        </p>
      </section>

      <section aria-label="Their videos" className="space-y-3">
        <h2 className="text-[16px] font-medium text-ink">My videos, as they see it</h2>
        {queue.length === 0 ? (
          <p className="text-[14px] text-graphite">Nothing assigned to them yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Video</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Context card</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((q) => (
                <TableRow key={q.videoId}>
                  <TableCell>
                    <span className="video-code text-ink">{q.displayCode}</span>
                  </TableCell>
                  <TableCell className="text-graphite">{q.partnerName ?? "–"}</TableCell>
                  <TableCell className="text-graphite">
                    {q.fillsContextCard ? "Theirs to fill" : "–"}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={q.observationStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {person.datasetScope !== "training" && (
        <section aria-label="Their calibration" className="space-y-3">
          <h2 className="text-[16px] font-medium text-ink">Calibration, as they see it</h2>
          {calibration.length === 0 ? (
            <p className="text-[14px] text-graphite">Nothing to calibrate yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow header>
                  <TableHead>Video</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calibration.map((c) => (
                  <TableRow key={c.videoId}>
                    <TableCell>
                      <span className="video-code text-ink">{c.displayCode}</span>
                    </TableCell>
                    <TableCell className="text-graphite">{c.partnerName ?? "–"}</TableCell>
                    <TableCell className="text-graphite">{c.stage.replaceAll("_", " ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </div>
  );
}
