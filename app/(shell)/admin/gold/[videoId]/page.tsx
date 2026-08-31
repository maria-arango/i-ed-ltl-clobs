/**
 * Master-score entry for one gold video (admin-only). Scores use the fixed
 * encoding; each item takes an optional rationale (they train the AI and
 * anchor calibration discussions). Saved under the active rubric version.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getGoldEntry } from "@/lib/db/admin-gold";
import { GoldScoreForm } from "./gold-score-form";

export default async function GoldEntryPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  await requireAdmin();
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) notFound();
  const entry = await getGoldEntry(videoId);
  if (!entry) notFound();

  return (
    <div className="mx-auto mt-2 max-w-[880px] space-y-8">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <Link
          href="/admin/gold"
          className="rounded-sm text-lake underline underline-offset-4"
        >
          Gold set
        </Link>
        <span aria-hidden> / </span>
        <span className="video-code text-graphite">{entry.video.displayCode}</span>
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
          Master scores · <span className="video-code">{entry.video.displayCode}</span>
        </h1>
        <p className="mono text-[12px] text-smoke">{entry.video.rawFilename}</p>
        <p className="text-[14px] text-graphite">
          Scored against rubric version{" "}
          <span className="mono">{entry.rubricLabel ?? "?"}</span>. These scores
          are the yardstick for certification and drift checks; they are never
          visible to coders.
        </p>
      </section>

      <GoldScoreForm
        videoId={videoId}
        concepts={entry.concepts}
        existing={entry.existing.map((e) => ({
          itemNo: e.itemNo,
          scoreNum: e.scoreNum,
          rationale: e.rationale,
        }))}
      />
    </div>
  );
}
