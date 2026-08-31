/**
 * Assignment — the weekly rhythm in one place (admin-only): rotate or form
 * pairs, plan the week (who works, at what pace), then deal the videos with
 * a seeded, previewed wave. Everything lands in assignment_log with its
 * seed, so the randomisation is reproducible and reportable.
 */
import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { videos } from "@/db/schema";
import { getWeekRoster, listPairs } from "@/lib/db/admin-assignment";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DissolveButton } from "./pair-forms";
import { RotationRunner } from "./rotation-runner";
import { WeekPlan } from "./week-plan";

/** Next Monday (or today if it is Monday), as yyyy-mm-dd. */
function nextMondayIso(): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  const shift = (8 - d.getUTCDay()) % 7;
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
}

export default async function AssignmentPage() {
  await requireAdmin();
  const defaultWeekStart = nextMondayIso();
  const [pairs, roster, [pool]] = await Promise.all([
    listPairs(),
    getWeekRoster(defaultWeekStart),
    db
      .select({ n: count() })
      .from(videos)
      .where(and(eq(videos.dataset, "live"), eq(videos.status, "pool"))),
  ]);
  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-10">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">Assignment</span>
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
          Assignment
        </h1>
        <p className="text-[15px] text-graphite">
          Each week: set the pairs, plan who is working and at what pace, then
          let the platform deal the videos: seeded, arm-balanced, schools
          spread, card duty split. You always preview before anything is
          written.
        </p>
      </section>

      {/* Pairs */}
      <section aria-label="Pairs" className="space-y-4">
        <h2
          className="font-sans font-medium text-ink"
          style={{
            fontSize: "var(--clobs-text-heading-sm)",
            lineHeight: "var(--clobs-leading-heading-sm)",
            letterSpacing: "var(--clobs-tracking-heading-sm)",
          }}
        >
          Pairs
        </h2>
        {pairs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Anchor</TableHead>
                <TableHead>Enumerator</TableHead>
                <TableHead>Active videos</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-ink">
                    {p.anchor.name ?? p.anchor.email}
                  </TableCell>
                  <TableCell className="text-ink">
                    {p.enumerator.name ?? p.enumerator.email}
                  </TableCell>
                  <TableCell className="num text-graphite">
                    {p.activeAssignments}
                  </TableCell>
                  <TableCell className="text-right">
                    <DissolveButton pairId={p.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-[14px] text-graphite">
            No pairs yet. Form the first one below.
          </p>
        )}
        <RotationRunner />
      </section>

      {/* The week: availability + wave */}
      <WeekPlan
        roster={roster}
        defaultWeekStart={defaultWeekStart}
        poolSize={Number(pool.n)}
      />
    </div>
  );
}
