/**
 * Reliability (addendum §9) on the Progress screen: the right statistics
 * for an ordinal four-point scale — exact and adjacent agreement,
 * quadratic-weighted kappa, Krippendorff's alpha (ordinal) — per item and
 * overall, plus who runs high or low against the consensus. Everything is
 * computed from signed calibrations; a value that cannot be computed yet
 * shows as a dash, never as a number.
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReliabilityView } from "@/lib/db/admin-progress";

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const num = (x: number | null, digits = 2) => (x === null ? "–" : x.toFixed(digits));
const signed = (x: number | null) =>
  x === null ? "–" : `${x > 0 ? "+" : ""}${x.toFixed(2)}`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="elev-card rounded-2xl border border-hairline bg-card p-4">
      <p className="mono text-[26px] leading-[1.2] text-ink">{value}</p>
      <p className="mt-1 text-[12px] text-graphite">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-smoke">{hint}</p>}
    </div>
  );
}

export function ReliabilityPanel({ stats }: { stats: ReliabilityView }) {
  const heading = (
    <div className="space-y-1">
      <h2
        className="font-sans font-medium text-ink"
        style={{
          fontSize: "var(--clobs-text-heading-sm)",
          lineHeight: "var(--clobs-leading-heading-sm)",
          letterSpacing: "var(--clobs-tracking-heading-sm)",
        }}
      >
        Reliability
      </h2>
      <p className="text-[14px] text-graphite">
        Agreement between the two individual scores of every signed
        calibration, and each coder&apos;s lean against the consensus. Plain
        percentage agreement alone misleads on a four-point scale, so the
        chance-corrected statistics sit beside it.
      </p>
    </div>
  );

  if (stats.overall.n === 0) {
    return (
      <section aria-label="Reliability" className="space-y-4">
        {heading}
        <p className="rounded-xl border border-dashed border-hairline-strong bg-card px-5 py-6 text-[14px] text-graphite">
          Nothing to measure yet. These statistics appear as soon as the first
          double-coded video is calibrated and signed by both coders.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Reliability" className="space-y-6">
      {heading}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Calibrated videos" value={String(stats.videos)} hint={`${stats.overall.n} item pairs`} />
        <Stat label="Exact agreement" value={pct(stats.overall.exact)} />
        <Stat label="Adjacent (within one band)" value={pct(stats.overall.adjacent)} />
        <Stat label="Quadratic-weighted kappa" value={num(stats.overall.kappaW)} hint="anchor vs enumerator" />
        <Stat label="Krippendorff's alpha (ordinal)" value={num(stats.overall.alpha)} />
      </div>

      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-smoke">Per concept</h3>
        <Table>
          <TableHeader>
            <TableRow header>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Pairs</TableHead>
              <TableHead className="text-right">Exact</TableHead>
              <TableHead className="text-right">Adjacent</TableHead>
              <TableHead className="text-right">Weighted kappa</TableHead>
              <TableHead className="text-right">Alpha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.perItem.map((it) => (
              <TableRow key={it.itemNo}>
                <TableCell>
                  <span className="mono mr-2 text-smoke">{it.itemNo}</span>
                  <span className="text-ink">{stats.itemNames[it.itemNo] ?? `Concept ${it.itemNo}`}</span>
                </TableCell>
                <TableCell className="mono text-right text-graphite">{it.n}</TableCell>
                <TableCell className="mono text-right">{pct(it.exact)}</TableCell>
                <TableCell className="mono text-right">{pct(it.adjacent)}</TableCell>
                <TableCell className="mono text-right">{num(it.kappaW)}</TableCell>
                <TableCell className="mono text-right">{num(it.alpha)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-smoke">Per coder, against the consensus</h3>
        <Table>
          <TableHeader>
            <TableRow header>
              <TableHead>Coder</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Matched consensus</TableHead>
              <TableHead className="text-right">Mean signed deviation</TableHead>
              <TableHead className="text-right">Crossed A/B</TableHead>
              <TableHead>Reads as</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.perCoder.map((c) => {
              const d = c.meanSignedDeviation ?? 0;
              const lean = d > 0.15 ? "runs high (toward B)" : d < -0.15 ? "runs low (toward A)" : "centred";
              return (
                <TableRow key={c.coderId}>
                  <TableCell className="text-ink">{stats.coderNames[c.coderId] ?? c.coderId.slice(0, 8)}</TableCell>
                  <TableCell className="mono text-right text-graphite">{c.n}</TableCell>
                  <TableCell className="mono text-right">{pct(c.exactWithConsensus)}</TableCell>
                  <TableCell className="mono text-right">{signed(c.meanSignedDeviation)}</TableCell>
                  <TableCell className="mono text-right">{pct(c.columnFlips)}</TableCell>
                  <TableCell className="text-graphite">{lean}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="text-[12px] text-smoke">
          Signed deviation is the coder&apos;s score minus the agreed score,
          averaged: positive means they score higher (toward column B) than
          the pair settled on. Weighted kappa and alpha need at least two
          pairs; single pairs show a dash.
        </p>
      </div>
    </section>
  );
}
