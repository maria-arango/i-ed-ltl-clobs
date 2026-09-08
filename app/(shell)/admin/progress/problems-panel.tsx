"use client";
/**
 * Video problems reported by coders (Amendment §48): what, who, when, and
 * the unblinded facts an admin needs to fix it (school, raw filename,
 * link). "Fixed" clears the flag with a note that goes to the audit log.
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
import type { VideoProblemRow } from "@/lib/db/admin-progress";
import { clearProblemAction } from "./actions";

export function ProblemsPanel({ problems }: { problems: VideoProblemRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (problems.length === 0) return null;

  return (
    <section aria-label="Video problems" className="space-y-3">
      <div className="space-y-1">
        <h2
          className="font-sans font-medium text-ink"
          style={{
            fontSize: "var(--clobs-text-heading-sm)",
            lineHeight: "var(--clobs-leading-heading-sm)",
            letterSpacing: "var(--clobs-tracking-heading-sm)",
          }}
        >
          Video problems
          <span
            className="badge-pop mono ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 align-middle text-[11px] font-semibold"
            style={{ background: "var(--clobs-clay)", color: "var(--clobs-paper)" }}
          >
            {problems.length}
          </span>
        </h2>
        <p className="text-[14px] text-graphite">
          Reported by coders from the video screen. Fix the link or the file (Video library), then mark it fixed; the coder&apos;s work is untouched.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow header>
            <TableHead>Video</TableHead>
            <TableHead>Problem</TableHead>
            <TableHead>Reported</TableHead>
            <TableHead>File</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {problems.map((p) => (
            <TableRow key={p.videoId}>
              <TableCell>
                <span className="video-code text-ink">{p.displayCode}</span>
              </TableCell>
              <TableCell className="text-ink">{p.reason}</TableCell>
              <TableCell className="text-[13px] text-graphite">
                {p.reportedBy} · {p.reportedAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </TableCell>
              <TableCell className="mono text-[12px] text-graphite">
                {p.rawFilename}
                {p.driveUrl && (
                  <>
                    {" "}
                    <a href={p.driveUrl} target="_blank" rel="noopener noreferrer" className="text-lake underline underline-offset-4">
                      link
                    </a>
                  </>
                )}
              </TableCell>
              <TableCell className="text-right">
                {openId === p.videoId ? (
                  <span className="inline-flex flex-wrap items-center justify-end gap-2">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What was done"
                      className="w-48 rounded-md border border-hairline-strong bg-paper px-2 py-1 text-[13px] text-ink"
                    />
                    <PillButton
                      disabled={pending || note.trim().length < 3}
                      onClick={() =>
                        start(async () => {
                          setError(null);
                          const r = await clearProblemAction(p.videoId, note);
                          if (!r.ok) setError(r.error ?? "Could not clear.");
                          else {
                            setOpenId(null);
                            setNote("");
                          }
                        })
                      }
                    >
                      {pending ? "Saving…" : "Mark fixed"}
                    </PillButton>
                    <PillButton onClick={() => setOpenId(null)}>Cancel</PillButton>
                  </span>
                ) : (
                  <PillButton onClick={() => setOpenId(p.videoId)}>Fixed</PillButton>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {error && (
        <p role="alert" className="text-[13px] text-clay">
          {error}
        </p>
      )}
    </section>
  );
}
