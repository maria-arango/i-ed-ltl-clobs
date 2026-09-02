/**
 * Training (admin-only): disposable trainee accounts with the full coder
 * experience minus calibration (Amendment §29), the gold-comparison
 * dashboard, and the admin sandbox ("live the coder's week yourself").
 * Provisional survival bar: ≥90% exact agreement with the gold pack.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  getTrainingDashboard,
  listTraineesWithProgress,
} from "@/lib/db/admin-training";
import { NumberTicker } from "@/components/ui/number-ticker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AddTraineeForm,
  AssignPackButton,
  DemoButtons,
  SandboxButton,
  TrainingViews,
} from "./training-widgets";
import { TrainingDashboardView } from "./training-dashboard";

export default async function TrainingPage() {
  await requireAdmin();
  const [trainees, dashboard] = await Promise.all([
    listTraineesWithProgress(),
    getTrainingDashboard(),
  ]);

  const accountsView = (
    <div className="space-y-6">
      <AddTraineeForm />
      <section aria-label="Trainee progress">
        {trainees.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Trainee</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Training videos</TableHead>
                <TableHead>Last submission</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trainees.map((t) => (
                <TableRow key={t.userId}>
                  <TableCell className="text-ink">{t.name ?? ""}</TableCell>
                  <TableCell className="mono text-[13px] text-graphite">{t.email}</TableCell>
                  <TableCell className="num">
                    <span className={t.submitted === t.assigned && t.assigned > 0 ? "text-ink" : "text-graphite"}>
                      {t.submitted} of {t.assigned} submitted
                    </span>
                  </TableCell>
                  <TableCell className="text-[13px] text-graphite">
                    {t.lastActivity
                      ? t.lastActivity.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      {t.assigned === 0 && <AssignPackButton userId={t.userId} />}
                      <Link
                        href={`/admin/training/${t.userId}`}
                        className="rounded-sm text-[13px] text-lake underline-offset-4 hover:underline"
                      >
                        View work
                      </Link>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-[14px] text-graphite">
            No training enumerators yet. Add the first above; deactivation and
            deletion live on the Team screen.
          </p>
        )}
      </section>
    </div>
  );

  const dashboardView = <TrainingDashboardView real={dashboard} />;

  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-8">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
          Home
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">Training</span>
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
          Training
        </h1>
        <p className="text-[15px] text-graphite">
          Trainee enumerators code the gold pack in a sandbox: the full coder
          experience, no calibration, nothing touching live data. Their
          agreement with the master scores decides who joins the team
          (provisionally: at least 90% exact agreement).
        </p>
      </section>

      {/* The admin sandbox */}
      <section
        aria-label="Sandbox"
        className="elev-card rounded-2xl border border-hairline bg-card p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-medium text-ink">
              Live the coder&apos;s week yourself
            </h2>
            <p className="mt-1 text-[13px] leading-[1.5] text-graphite">
              Adds the training pack (<NumberTicker value={dashboard.videos.length} />{" "}
              gold videos) to your own My videos as sandbox work: card, notes,
              scores, submission, exactly as an enumerator sees it.
            </p>
          </div>
          <SandboxButton />
        </div>
        <div className="mt-4 border-t border-hairline pt-4">
          <p className="text-[13px] leading-[1.5] text-graphite">
            Or use the two DEMO videos (one to code end to end, one with a
            calibration partner already waiting). Deleting them removes every
            score, note and card written on them, so demo work never takes up
            space and your personal dashboard restarts clean.
          </p>
          <div className="mt-3">
            <DemoButtons />
          </div>
        </div>
      </section>

      <TrainingViews accounts={accountsView} dashboard={dashboardView} />
    </div>
  );
}
