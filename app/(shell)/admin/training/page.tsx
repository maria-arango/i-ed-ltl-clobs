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
  SandboxButton,
  TrainingViews,
} from "./training-widgets";

const THRESHOLD = 0.9; // provisional (Amendment §29)

function cellTone(gold: number, mine: number | null): React.CSSProperties {
  if (mine == null) return { color: "var(--clobs-smoke)" };
  const d = Math.abs(mine - gold);
  if (d === 0)
    return { background: "var(--clobs-forest-wash)", color: "var(--clobs-forest)" };
  if (d === 1)
    return { background: "var(--clobs-score-2)", color: "var(--clobs-ink)" };
  return { background: "var(--clobs-clay-wash, #F3DDD1)", color: "var(--clobs-clay)" };
}

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

  const dashboardView = (
    <div className="space-y-8">
      {dashboard.videos.length === 0 ? (
        <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
          <p className="text-[15px] text-graphite">
            The dashboard fills once the gold set has master scores and
            trainees start submitting. Add gold videos on the Gold set screen
            first.
          </p>
        </div>
      ) : (
        <>
          {/* Overall reliability per trainee */}
          <section aria-label="Reliability against the gold standard" className="space-y-3">
            <h3 className="text-[15px] font-medium text-ink">
              Agreement with the gold standard, across all videos
            </h3>
            <Table>
              <TableHeader>
                <TableRow header>
                  <TableHead>Trainee</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Exact</TableHead>
                  <TableHead>Adjacent (±1)</TableHead>
                  <TableHead>Weighted</TableHead>
                  <TableHead>Leans</TableHead>
                  <TableHead>A/B flips</TableHead>
                  <TableHead>Bar (90%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.stats.map((s) => {
                  const exactRate = s.itemsCompared ? s.exact / s.itemsCompared : 0;
                  const passes = s.itemsCompared > 0 && exactRate >= THRESHOLD;
                  return (
                    <TableRow key={s.userId}>
                      <TableCell className="text-ink">{s.label}</TableCell>
                      <TableCell className="num text-graphite">{s.itemsCompared}</TableCell>
                      <TableCell className="num text-ink">
                        {s.itemsCompared ? `${Math.round(exactRate * 100)}%` : "—"}
                        {s.itemsCompared > 0 && (
                          <span className="text-[12px] text-smoke"> ({s.exact}/{s.itemsCompared})</span>
                        )}
                      </TableCell>
                      <TableCell className="num text-graphite">
                        {s.itemsCompared ? `${Math.round((s.adjacent / s.itemsCompared) * 100)}%` : "—"}
                      </TableCell>
                      <TableCell className="num text-graphite">
                        {s.itemsCompared ? s.weighted.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="num text-graphite">
                        {s.itemsCompared
                          ? s.meanSigned > 0.05
                            ? `+${s.meanSigned.toFixed(2)} (toward B)`
                            : s.meanSigned < -0.05
                              ? `${s.meanSigned.toFixed(2)} (toward A)`
                              : "balanced"
                          : "—"}
                      </TableCell>
                      <TableCell className={`num ${s.columnFlips > 0 ? "text-clay" : "text-graphite"}`}>
                        {s.itemsCompared ? s.columnFlips : "—"}
                      </TableCell>
                      <TableCell>
                        {s.itemsCompared === 0 ? (
                          <span className="text-[12px] text-smoke">no data</span>
                        ) : passes ? (
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                            style={{ background: "var(--clobs-forest-wash)", color: "var(--clobs-forest)" }}
                          >
                            above the bar
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                            style={{ background: "var(--clobs-sunken)", color: "var(--clobs-clay)" }}
                          >
                            below
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-[12px] leading-[1.5] text-smoke">
              Exact = same score. Adjacent = within one point. Weighted =
              quadratic agreement (1.00 is perfect; large misses cost more).
              Leans = mean signed deviation (who runs high or low). A/B flips =
              disagreeing about the column itself, the serious kind of miss.
              The 90% bar is provisional (Amendment §29).
            </p>
          </section>

          {/* Per-video matrices: gold first, one column per trainee */}
          {dashboard.videos.map((v) => (
            <section key={v.videoId} aria-label={`Scores for ${v.displayCode}`} className="space-y-2">
              <h3 className="text-[15px] font-medium text-ink">
                <span className="video-code">{v.displayCode}</span>
              </h3>
              <Table>
                <TableHeader>
                  <TableRow header>
                    <TableHead>Item</TableHead>
                    <TableHead>Gold</TableHead>
                    {dashboard.trainees.map((t) => (
                      <TableHead key={t.userId}>{t.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.items.map((item) => (
                    <TableRow key={item.itemNo}>
                      <TableCell className="num text-graphite">{item.itemNo}</TableCell>
                      <TableCell>
                        <span className="mono inline-flex size-6 items-center justify-center rounded-full bg-sunken text-[13px] font-semibold text-ink">
                          {item.gold}
                        </span>
                      </TableCell>
                      {dashboard.trainees.map((t) => {
                        const mine = item.byTrainee[t.userId];
                        return (
                          <TableCell key={t.userId}>
                            <span
                              className="mono inline-flex size-6 items-center justify-center rounded-full text-[13px] font-medium"
                              style={cellTone(item.gold, mine)}
                            >
                              {mine ?? "—"}
                            </span>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ))}
        </>
      )}
    </div>
  );

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
      </section>

      <TrainingViews accounts={accountsView} dashboard={dashboardView} />
    </div>
  );
}
