/**
 * Assignment — pairs and waves (admin-only). The admin forms pairs
 * (anchor + enumerator, Amendment B §2) and runs seeded waves with a
 * preview-before-confirm flow. Everything lands in assignment_log with
 * its seed, so the randomisation is reproducible and reportable.
 */
import Link from "next/link";
import { and, count, eq, max } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { assignments, videos } from "@/db/schema";
import {
  listPairCandidates,
  listPairs,
} from "@/lib/db/admin-assignment";
import { AppShell } from "@/components/app-shell";
import { CreatePairForm, DissolveButton } from "./pair-forms";
import { RotationRunner } from "./rotation-runner";
import { WaveRunner } from "./wave-runner";

export default async function AssignmentPage() {
  const session = await requireAdmin();
  const [pairs, candidates, [pool], [wave]] = await Promise.all([
    listPairs(),
    listPairCandidates(),
    db
      .select({ n: count() })
      .from(videos)
      .where(and(eq(videos.dataset, "live"), eq(videos.status, "pool"))),
    db
      .select({ maxWave: max(assignments.waveNo) })
      .from(assignments)
      .where(eq(assignments.dataset, "live")),
  ]);
  const nextWaveNo = (wave.maxWave ?? 0) + 1;
  // Enumerators already in an active pair stay listed (rotation forms new
  // pairs between waves), but the eligible list excludes placeholders.
  const enumerators = candidates.enumerators.filter(
    (c) => !c.email.endsWith("@example.invalid"),
  );

  return (
    <AppShell
      email={session.user.email}
      role={session.user.role}
      isChiefCoder={session.user.isChiefCoder}
    >
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
          <p className="max-w-[68ch] text-[15px] text-graphite">
            Form the pairs, then let the platform deal the videos: seeded,
            arm-balanced, schools spread, card duty split. You always preview
            before anything is written.
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
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full border-collapse text-left text-[14px]">
                <thead>
                  <tr className="bg-sunken text-[12px] text-graphite">
                    <th className="px-4 py-2 font-semibold">Anchor</th>
                    <th className="px-4 py-2 font-semibold">Enumerator</th>
                    <th className="px-4 py-2 font-semibold">Active videos</th>
                    <th className="px-4 py-2 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((p) => (
                    <tr key={p.id} className="h-11 border-t border-hairline">
                      <td className="px-4 text-ink">
                        {p.anchor.name ?? p.anchor.email}
                      </td>
                      <td className="px-4 text-ink">
                        {p.enumerator.name ?? p.enumerator.email}
                      </td>
                      <td className="num px-4 text-graphite">{p.activeAssignments}</td>
                      <td className="px-4 text-right">
                        <DissolveButton pairId={p.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[14px] text-graphite">
              No pairs yet — form the first one below.
            </p>
          )}
          <RotationRunner />
          <CreatePairForm anchors={candidates.anchors} enumerators={enumerators} />
        </section>

        {/* Waves */}
        <WaveRunner nextWaveNo={nextWaveNo} poolSize={Number(pool.n)} />
      </div>
    </AppShell>
  );
}
