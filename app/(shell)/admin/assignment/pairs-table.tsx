"use client";
/**
 * The pairs table with an expandable "their hand" card (María,
 * 2026-09-01): one click on a row reveals, right below it, how that pair's
 * randomized assignment looks — arm mix, schools, card duties, and every
 * video code with its arm dot. The card rises in like a moment; counts
 * tick up. Admin surface: arms and school ids are unblinded by design.
 */
import { useState, useTransition } from "react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { PillButton } from "@/components/ui/pill-button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { pairDetailsAction } from "./actions";
import type { PairAssignmentDetails } from "@/lib/db/admin-assignment";
import { DissolveButton } from "./pair-forms";

const ARM_COLOR: Record<string, string> = {
  control: "#2F6BAA",
  dispersed: "#B4642B",
  connected: "#7B4B94",
};

export interface PairRowData {
  id: string;
  anchorLabel: string;
  enumeratorLabel: string;
  activeAssignments: number;
}

function HandCard({ details }: { details: PairAssignmentDetails }) {
  if (details.total === 0) {
    return (
      <div className="moment-enter elev-card rounded-xl border border-hairline bg-card p-5">
        <p className="text-[14px] text-graphite">
          Nothing dealt to this pair yet — their hand fills when a wave is
          confirmed.
        </p>
      </div>
    );
  }
  return (
    <div className="moment-enter elev-card space-y-4 rounded-xl border border-hairline bg-card p-5">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <p className="text-[14px] text-graphite">
          <NumberTicker value={details.total} className="text-[20px] text-ink" />{" "}
          videos in hand
        </p>
        <p className="text-[14px] text-graphite">
          <NumberTicker value={details.schools} className="text-[20px] text-ink" />{" "}
          schools
        </p>
        <p className="text-[14px] text-graphite">
          cards:{" "}
          <span className="mono text-ink">{details.anchorCards}</span> anchor ·{" "}
          <span className="mono text-ink">{details.enumeratorCards}</span>{" "}
          enumerator
        </p>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1">
        {(["control", "dispersed", "connected"] as const).map((arm) => (
          <li key={arm} className="flex items-center gap-1.5 text-[13px] text-graphite">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: ARM_COLOR[arm] }}
            />
            <span className="capitalize">{arm}</span>
            <span className="mono text-smoke">{details.armCounts[arm]}</span>
          </li>
        ))}
      </ul>

      <ul className="flex flex-wrap gap-1.5">
        {details.videos.map((v) => (
          <li
            key={v.displayCode}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper px-2.5 py-1"
            title={`school ${v.sid} · ${v.arm ?? "no arm"} · card: ${v.cardFiller}`}
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: v.arm ? ARM_COLOR[v.arm] : "var(--clobs-ash)" }}
            />
            <span className="video-code text-[12px] text-ink">{v.displayCode}</span>
            {v.cardFiller === "anchor" && (
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.04em]"
                style={{ color: "var(--clobs-forest)" }}
                title="The anchor fills this card"
              >
                card
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-smoke">
        Each dot is the video&apos;s treatment arm; &ldquo;card&rdquo; marks
        the ones where the anchor fills the context card (the rest are the
        enumerator&apos;s).
      </p>
    </div>
  );
}

export function PairsTable({ pairs }: { pairs: PairRowData[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, PairAssignmentDetails>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const toggle = (pairId: string) => {
    if (openId === pairId) {
      setOpenId(null);
      return;
    }
    setOpenId(pairId);
    if (!details[pairId]) {
      startTransition(async () => {
        const r = await pairDetailsAction(pairId);
        if (r.ok) {
          setDetails((prev) => ({ ...prev, [pairId]: r.details }));
        } else {
          setErrors((prev) => ({ ...prev, [pairId]: r.error }));
        }
      });
    }
  };

  return (
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
          <PairRowGroup
            key={p.id}
            pair={p}
            open={openId === p.id}
            details={details[p.id]}
            error={errors[p.id]}
            loading={pending && openId === p.id && !details[p.id]}
            onToggle={() => toggle(p.id)}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function PairRowGroup({
  pair,
  open,
  details,
  error,
  loading,
  onToggle,
}: {
  pair: PairRowData;
  open: boolean;
  details?: PairAssignmentDetails;
  error?: string;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell className="text-ink">{pair.anchorLabel}</TableCell>
        <TableCell className="text-ink">{pair.enumeratorLabel}</TableCell>
        <TableCell className="num text-graphite">{pair.activeAssignments}</TableCell>
        <TableCell className="text-right">
          <span className="inline-flex items-center justify-end gap-1.5">
            <PillButton aria-expanded={open} onClick={onToggle}>
              {open ? "Hide their hand" : "See their hand"}
            </PillButton>
            <DissolveButton pairId={pair.id} />
          </span>
        </TableCell>
      </TableRow>
      {open && (
        <tr className="border-t border-hairline">
          <td colSpan={4} className="bg-sunken/40 px-4 py-4">
            {error ? (
              <p className="text-[13px] text-clay">{error}</p>
            ) : loading || !details ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-64 bg-sunken" />
                <Skeleton className="h-4 w-96 bg-sunken" />
                <Skeleton className="h-8 w-full bg-sunken" />
              </div>
            ) : (
              <HandCard details={details} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}
