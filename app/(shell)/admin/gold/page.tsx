/**
 * Gold set + certification (admin-only). The gold videos and their master
 * scores are the yardstick; trainees' agreement against them is computed
 * live, and a pass promotes the account to the live dataset (Amendment B
 * §9, §23). Raw filenames appear here because this is an admin surface.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getTraineeAgreement, listGoldVideos } from "@/lib/db/admin-gold";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddGoldSearch, CertifyButtons } from "./gold-widgets";

function pct(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

export default async function GoldPage() {
  await requireAdmin();
  const [goldVideos, trainees] = await Promise.all([
    listGoldVideos(),
    getTraineeAgreement(),
  ]);

  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-10">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">Gold set</span>
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
          Gold set &amp; certification
        </h1>
        <p className="text-[15px] text-graphite">
          The master-scored videos every coder is measured against (target: 6,
          two good, two neutral, two bad), and each trainee&apos;s agreement with
          them. Coders never see which videos are gold.
        </p>
      </section>

      {/* Gold videos */}
      <section aria-label="Gold videos" className="space-y-4">
        <h2
          className="font-sans font-medium text-ink"
          style={{
            fontSize: "var(--clobs-text-heading-sm)",
            lineHeight: "var(--clobs-leading-heading-sm)",
            letterSpacing: "var(--clobs-tracking-heading-sm)",
          }}
        >
          Gold videos
        </h2>
        {goldVideos.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Video</TableHead>
                <TableHead>Session file</TableHead>
                <TableHead>Master scores</TableHead>
                <TableHead>Drive link</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {goldVideos.map((v) => (
                <TableRow key={v.videoId}>
                  <TableCell>
                    <span className="video-code text-[14px] text-ink">
                      {v.displayCode}
                    </span>
                  </TableCell>
                  <TableCell className="mono text-[12px] text-graphite">
                    {v.rawFilename}
                  </TableCell>
                  <TableCell
                    className={
                      v.scoresEntered === 8 ? "text-ink" : "text-clay"
                    }
                  >
                    {v.scoresEntered} of 8
                  </TableCell>
                  <TableCell className="text-[13px] text-graphite">
                    {v.hasDriveUrl ? "Attached" : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/gold/${v.videoId}`}
                      className="rounded-sm text-[14px] text-lake underline-offset-4 hover:underline"
                    >
                      {v.scoresEntered === 8 ? "Review scores" : "Enter scores"}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-[14px] text-graphite">
            No gold videos yet. Search below to add the first one.
          </p>
        )}
        <AddGoldSearch />
      </section>

      {/* Certification */}
      <section aria-label="Certification" className="space-y-4">
        <h2
          className="font-sans font-medium text-ink"
          style={{
            fontSize: "var(--clobs-text-heading-sm)",
            lineHeight: "var(--clobs-leading-heading-sm)",
            letterSpacing: "var(--clobs-tracking-heading-sm)",
          }}
        >
          Trainee certification
        </h2>
        <p className="text-[14px] text-graphite">
          Agreement is computed against the master scores across every gold
          video the trainee has submitted. Exact = the same score; adjacent =
          within one point on the four-point scale. Certifying promotes the
          account to live coding; the decision and the numbers are recorded.
        </p>
        {trainees.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Trainee</TableHead>
                <TableHead>Gold videos coded</TableHead>
                <TableHead>Exact</TableHead>
                <TableHead>Adjacent</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trainees.map((t) => (
                <TableRow key={t.userId}>
                  <TableCell className="text-ink">{t.name ?? t.email}</TableCell>
                  <TableCell className="num text-graphite">
                    {t.goldVideosCoded}
                  </TableCell>
                  <TableCell className="num text-ink">
                    {pct(t.exact, t.itemsCompared)}
                    {t.itemsCompared > 0 && (
                      <span className="text-[12px] text-smoke">
                        {" "}
                        ({t.exact}/{t.itemsCompared})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="num text-graphite">
                    {pct(t.adjacent, t.itemsCompared)}
                  </TableCell>
                  <TableCell className="num text-graphite">
                    {t.attempts}
                    {t.latestStatus ? ` (${t.latestStatus})` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <CertifyButtons
                      userId={t.userId}
                      disabled={t.itemsCompared === 0}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-[14px] text-graphite">
            No trainee accounts right now. Add trainees on the Team screen
            (tick &quot;Trainee&quot;); they code the training videos, and their
            agreement appears here.
          </p>
        )}
      </section>
    </div>
  );
}
