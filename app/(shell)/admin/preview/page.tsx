/**
 * "What Arya can see" — a read-only mirror of Arya's queues, visible to
 * María ONLY (her request, 2026-09-01). It reads through the same
 * restricted coder layer Arya's own session uses, so it shows exactly what
 * his account can obtain: display codes, his own progress, partner names,
 * calibration stages. It cannot show more — the blinding boundary holds.
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

const OWNER_EMAIL = "maria_oteroarango@gse.harvard.edu";
const ARYA_EMAIL = "arya_shanmuganathan@g.harvard.edu";

export default async function AryaPreviewPage() {
  const session = await requireAdmin();
  if (session.user.email?.toLowerCase() !== OWNER_EMAIL) notFound();

  const [arya] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, ARYA_EMAIL));
  if (!arya) notFound();

  const [queue, calibration] = await Promise.all([
    getCoderQueue(arya.id),
    getCalibrationQueue(arya.id),
  ]);

  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-8">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">What Arya can see</span>
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
          What Arya can see
        </h1>
        <p className="text-[15px] text-graphite">
          A read-only mirror of {arya.name ?? "Arya"}&apos;s queues, fetched
          through the same restricted layer his session uses — so this page
          can never show more than his account could obtain. As an admin he
          also sees every admin screen, including the Training dashboard and
          its 10-enumerator sample preview.
        </p>
      </section>

      <section aria-label="Arya's videos" className="space-y-3">
        <h2 className="text-[16px] font-medium text-ink">His My videos queue</h2>
        {queue.length === 0 ? (
          <p className="text-[14px] text-graphite">Nothing assigned to him yet.</p>
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
                  <TableCell className="text-graphite">{q.partnerName ?? "—"}</TableCell>
                  <TableCell className="text-graphite">
                    {q.fillsContextCard ? "His to fill" : "—"}
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

      <section aria-label="Arya's calibration" className="space-y-3">
        <h2 className="text-[16px] font-medium text-ink">His calibration queue</h2>
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
                  <TableCell className="text-graphite">{c.partnerName ?? "—"}</TableCell>
                  <TableCell className="text-graphite">{c.stage.replaceAll("_", " ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
