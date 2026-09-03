/**
 * Progress (admin-only) — the first Stage 4 dashboard: insight cards with
 * counting numbers, and every codable video's stage in a filterable table.
 * Reliability statistics (weighted kappa etc.) join this screen later in
 * Stage 4.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getProgressOverview, getReliabilityStats } from "@/lib/db/admin-progress";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ProgressDashboard } from "./progress-dashboard";
import { ReliabilityPanel } from "./reliability-panel";

const CARDS: Array<{
  key: "codable" | "assigned" | "one_submitted" | "ready_to_calibrate" | "calibrated";
  label: string;
  accent?: string;
}> = [
  { key: "codable", label: "Codable videos" },
  { key: "assigned", label: "Out with pairs", accent: "var(--clobs-lake)" },
  { key: "one_submitted", label: "1 of 2 scores in", accent: "var(--clobs-score-2-edge)" },
  { key: "ready_to_calibrate", label: "Ready to calibrate", accent: "var(--clobs-score-3-edge)" },
  { key: "calibrated", label: "Calibrated", accent: "var(--clobs-forest)" },
];

export default async function ProgressPage() {
  await requireAdmin();
  const [{ totals, rows }, reliability] = await Promise.all([
    getProgressOverview(),
    getReliabilityStats(),
  ]);

  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-8">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">Progress</span>
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
          Progress
        </h1>
        <p className="text-[15px] text-graphite">
          Every codable video on its way from the pool to a signed
          calibration, and how reliably the pairs agree.
        </p>
      </section>

      <section aria-label="Study totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CARDS.map((c) => (
          <div
            key={c.key}
            className="elev-card rounded-2xl border border-hairline bg-card p-4"
          >
            <p
              className="text-[26px] leading-[1.2]"
              style={{ color: c.accent ?? "var(--clobs-ink)" }}
            >
              <NumberTicker value={totals[c.key]} />
            </p>
            <p className="mt-1 text-[12px] text-graphite">{c.label}</p>
          </div>
        ))}
      </section>

      <ProgressDashboard rows={rows} />

      <ReliabilityPanel stats={reliability} />
    </div>
  );
}
