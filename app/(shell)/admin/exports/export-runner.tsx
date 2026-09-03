"use client";
/**
 * "Generate export" — one button, a pending state, and a moment card when
 * the new export lands. Generation reads the whole live dataset and writes
 * every file in one transaction, so it takes a few seconds.
 */
import { useState, useTransition } from "react";
import { MomentCard } from "@/components/ui/moment-card";
import { createExportAction, type ExportActionResult } from "./actions";

export function ExportRunner({ tableCount }: { tableCount: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ExportActionResult | null>(null);

  return (
    <div className="elev-card space-y-4 rounded-2xl border border-hairline bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2
            className="font-sans font-medium text-ink"
            style={{
              fontSize: "var(--clobs-text-heading-sm)",
              lineHeight: "var(--clobs-leading-heading-sm)",
              letterSpacing: "var(--clobs-tracking-heading-sm)",
            }}
          >
            Generate a new export
          </h2>
          <p className="text-[14px] text-graphite">
            Reads every live record and writes {tableCount} tables as CSV and
            Stata (.dta, labelled), plus the codebook and a manifest. The files
            are stored exactly as generated, so this export will always
            download unchanged.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() =>
            startTransition(async () => {
              setResult(null);
              setResult(await createExportAction());
            })
          }
          className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
        >
          {pending ? "Generating…" : "Generate export"}
        </button>
      </div>
      {result && !result.ok && (
        <p role="alert" className="text-[14px] text-clay">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <MomentCard>
          Export ready: {result.rows?.toLocaleString("en-GB")} rows across{" "}
          {tableCount} tables, stored and listed below.
        </MomentCard>
      )}
    </div>
  );
}
