/**
 * Video library (admin-only): how many sessions have their real Drive
 * links, bulk attachment by filename prefix, and the list of what's still
 * missing. Raw filenames are visible because this is an admin surface —
 * they never reach coders (§3).
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getVideoLinkStats, listVideosMissingLinks } from "@/lib/db/admin-videos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NumberTicker } from "@/components/ui/number-ticker";
import { LinkAttacher } from "./link-attacher";

export default async function VideoLibraryPage() {
  await requireAdmin();
  const [stats, missing] = await Promise.all([
    getVideoLinkStats(),
    listVideosMissingLinks(25),
  ]);

  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-10">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">Video library</span>
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
          Video library
        </h1>
        <p className="text-[15px] text-graphite">
          Every codable session and its Drive link. Coders can only watch a
          video once its link is attached here.
        </p>
      </section>

      <section
        aria-label="Link coverage"
        className="flex flex-wrap items-baseline gap-x-10 gap-y-2 border-y border-hairline py-4"
      >
        <p className="text-[14px] text-graphite">
          <NumberTicker value={stats.codable} className="text-[20px] text-ink" />{" "}
          codable sessions
        </p>
        <p className="text-[14px] text-graphite">
          <span style={{ color: "var(--clobs-forest)" }}>
            <NumberTicker value={stats.withLink} className="text-[20px]" />
          </span>{" "}
          with a Drive link
        </p>
        <p className="text-[14px] text-graphite">
          <NumberTicker value={stats.withoutLink} className="text-[20px] text-clay" />{" "}
          still missing
        </p>
      </section>

      <LinkAttacher />

      {missing.length > 0 && (
        <section aria-label="Missing links" className="space-y-3">
          <h2
            className="font-sans font-medium text-ink"
            style={{
              fontSize: "var(--clobs-text-heading-sm)",
              lineHeight: "var(--clobs-leading-heading-sm)",
              letterSpacing: "var(--clobs-tracking-heading-sm)",
            }}
          >
            Still missing a link
            {stats.withoutLink > missing.length && (
              <span className="ml-2 text-[13px] font-normal text-smoke">
                (first {missing.length} of {stats.withoutLink})
              </span>
            )}
          </h2>
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Video</TableHead>
                <TableHead>Session file</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {missing.map((v) => (
                <TableRow key={v.videoId}>
                  <TableCell>
                    <span className="video-code text-ink">{v.displayCode}</span>
                  </TableCell>
                  <TableCell className="mono text-[12px] text-graphite">
                    {v.rawFilename}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
