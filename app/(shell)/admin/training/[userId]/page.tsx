/**
 * One trainee's work, video by video (admin-only): every score with its
 * justification next to the gold score, and their note — for revising
 * quality before a certification decision.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getTraineeWork } from "@/lib/db/admin-training";
import { sanitizeNoteHtml } from "@/lib/sanitize-note";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function TraineeWorkPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  const { trainee, work } = await getTraineeWork(userId);
  if (!trainee) notFound();

  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-8">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <Link
          href="/admin/training"
          className="rounded-sm text-lake underline underline-offset-4"
        >
          Training
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">{trainee.name ?? trainee.email}</span>
      </nav>

      <section className="space-y-1">
        <h1
          className="font-sans font-medium text-ink"
          style={{
            fontSize: "var(--clobs-text-heading)",
            lineHeight: "var(--clobs-leading-heading)",
            letterSpacing: "var(--clobs-tracking-heading)",
          }}
        >
          {trainee.name ?? trainee.email}
        </h1>
        <p className="text-[14px] text-graphite">
          Every training response with the gold score alongside. Green means
          exact; the justification tells you whether a miss was reasoning or
          reading.
        </p>
      </section>

      {work.length === 0 && (
        <p className="text-[14px] text-graphite">Nothing coded yet.</p>
      )}

      {work.map((v) => (
        <section
          key={v.videoId}
          aria-label={v.displayCode}
          className="elev-card space-y-4 rounded-2xl border border-hairline bg-card p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="video-code text-[18px] text-ink">{v.displayCode}</h2>
            <span className="text-[13px] text-graphite">
              {v.status === "submitted"
                ? `Submitted ${v.submittedAt?.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) ?? ""}`
                : "In progress"}
            </span>
          </div>

          {v.scores.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow header>
                  <TableHead>Item</TableHead>
                  <TableHead>Their score</TableHead>
                  <TableHead>Gold</TableHead>
                  <TableHead>Justification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.scores.map((s) => {
                  const match =
                    s.gold != null ? Math.abs(s.scoreNum - s.gold) : null;
                  return (
                    <TableRow key={s.itemNo}>
                      <TableCell className="num text-graphite">{s.itemNo}</TableCell>
                      <TableCell>
                        <span
                          className="mono inline-flex size-6 items-center justify-center rounded-full text-[13px] font-medium"
                          style={
                            match == null
                              ? { background: "var(--clobs-sunken)", color: "var(--clobs-ink)" }
                              : match === 0
                                ? { background: "var(--clobs-forest-wash)", color: "var(--clobs-forest)" }
                                : match === 1
                                  ? { background: "var(--clobs-score-2)", color: "var(--clobs-ink)" }
                                  : { background: "#F3DDD1", color: "var(--clobs-clay)" }
                          }
                        >
                          {s.scoreNum}
                        </span>
                      </TableCell>
                      <TableCell className="num text-graphite">{s.gold ?? "—"}</TableCell>
                      <TableCell className="text-[13px] leading-[1.5] text-graphite">
                        {s.justification || <span className="text-smoke">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-[14px] text-graphite">No scores yet.</p>
          )}

          {v.noteHtml && (
            <details>
              <summary className="cursor-pointer rounded-sm text-[13px] text-lake">
                Their notes
              </summary>
              <div
                className="mt-2 rounded-lg border border-hairline bg-paper p-4 text-[14px] leading-[1.6] text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(v.noteHtml) }}
              />
            </details>
          )}
        </section>
      ))}
    </div>
  );
}
