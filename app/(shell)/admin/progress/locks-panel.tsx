"use client";
/**
 * Started videos (Amendment §45): who holds which video right now, and a
 * release with a reason for when a link is broken or someone is away.
 * Releasing keeps every keystroke; it only frees the coder to move on.
 */
import { useState, useTransition } from "react";
import { PillButton } from "@/components/ui/pill-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActiveLockRow } from "@/lib/db/admin-progress";
import { releaseLockAction } from "./actions";

export function LocksPanel({ locks }: { locks: ActiveLockRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section aria-label="Started videos" className="space-y-3">
      <div className="space-y-1">
        <h2
          className="font-sans font-medium text-ink"
          style={{
            fontSize: "var(--clobs-text-heading-sm)",
            lineHeight: "var(--clobs-leading-heading-sm)",
            letterSpacing: "var(--clobs-tracking-heading-sm)",
          }}
        >
          Started videos
        </h2>
        <p className="text-[14px] text-graphite">
          One video at a time: a coder who started a video finishes it before
          the next. Release a lock only when the video itself is the problem
          (broken link, swapped file) or the coder is away; their work stays.
        </p>
      </div>
      {locks.length === 0 ? (
        <p className="text-[14px] text-graphite">Nobody is mid-video right now.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow header>
              <TableHead>Coder</TableHead>
              <TableHead>Video</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locks.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-ink">{l.coderName}</TableCell>
                <TableCell>
                  <span className="video-code text-ink">{l.displayCode}</span>
                  {l.dataset !== "live" && <span className="ml-2 text-[11px] text-smoke">{l.dataset}</span>}
                </TableCell>
                <TableCell className="text-[13px] text-graphite">
                  {l.startedAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </TableCell>
                <TableCell className="text-right">
                  {openId === l.id ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason (goes to the audit log)"
                        className="w-56 rounded-md border border-hairline-strong bg-paper px-2 py-1 text-[13px] text-ink"
                      />
                      <PillButton
                        disabled={pending || reason.trim().length < 3}
                        onClick={() =>
                          start(async () => {
                            setError(null);
                            const r = await releaseLockAction(l.id, reason);
                            if (!r.ok) setError(r.error ?? "Could not release.");
                            else {
                              setOpenId(null);
                              setReason("");
                            }
                          })
                        }
                      >
                        {pending ? "Releasing…" : "Confirm release"}
                      </PillButton>
                      <PillButton onClick={() => setOpenId(null)}>Cancel</PillButton>
                    </span>
                  ) : (
                    <PillButton variant="danger" onClick={() => setOpenId(l.id)}>
                      Release
                    </PillButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-clay">
          {error}
        </p>
      )}
    </section>
  );
}
