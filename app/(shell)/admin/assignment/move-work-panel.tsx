"use client";
/**
 * "Move this pair's work" (addendum §6): choose where the videos go, see
 * the consequence for every video BEFORE anything is written, give a
 * reason, confirm. The preview is hash-guarded: if the work changes
 * between preview and confirm, the confirm is refused.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MomentCard } from "@/components/ui/moment-card";
import type { MoveAction, MovePreview, MoveState } from "@/lib/db/admin-reassignment";
import { confirmMoveAction, previewMoveAction } from "./actions";

const STATE_LABEL: Record<MoveState, string> = {
  untouched: "Not started",
  in_progress: "In progress",
  one_submitted: "1 of 2 submitted",
  both_submitted: "Both submitted",
};
const ACTION_LABEL: Record<MoveAction, { text: string; color: string }> = {
  transfer: { text: "Moves", color: "var(--clobs-lake)" },
  return_to_pool: { text: "Back to pool", color: "var(--clobs-forest)" },
  hold: { text: "Stays", color: "var(--clobs-graphite)" },
};

export function MoveWorkPanel({
  pairId,
  pairLabel,
  otherPairs,
}: {
  pairId: string;
  pairLabel: string;
  otherPairs: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [toPairId, setToPairId] = useState<string>("");
  const [includeSubmitted, setIncludeSubmitted] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<MovePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ transferred: number; returned: number; held: number } | null>(null);
  const [pending, start] = useTransition();

  const runPreview = () =>
    start(async () => {
      setError(null);
      setDone(null);
      const r = await previewMoveAction({ fromPairId: pairId, toPairId: toPairId || null, includeSubmitted });
      if (r.ok && r.preview) setPreview(r.preview);
      else {
        setPreview(null);
        setError(r.error ?? "Could not preview.");
      }
    });

  const runConfirm = () =>
    start(async () => {
      if (!preview) return;
      setError(null);
      const r = await confirmMoveAction({
        fromPairId: pairId,
        toPairId: toPairId || null,
        includeSubmitted,
        reason,
        expectedHash: preview.hash,
      });
      if (r.ok && r.result) {
        setDone(r.result);
        setPreview(null);
        router.refresh();
      } else {
        setError(r.error ?? "Could not confirm.");
      }
    });

  const actionable = preview ? preview.counts.transfer + preview.counts.return_to_pool : 0;

  return (
    <div className="moment-enter elev-card space-y-5 rounded-xl border border-hairline bg-card p-5">
      <div className="space-y-1">
        <p className="text-[15px] text-ink">Move {pairLabel}&apos;s work</p>
        <p className="text-[13px] text-graphite">
          Nothing is deleted. Videos nobody started can go back to the pool;
          anything with work moves to another pair with its history. Every
          step is written to the assignment log with your reason.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-[13px] text-graphite">
          <span>Destination</span>
          <select
            value={toPairId}
            onChange={(e) => {
              setToPairId(e.target.value);
              setPreview(null);
            }}
            className="w-full rounded-md border border-hairline-strong bg-paper px-3 py-2 text-[14px] text-ink"
          >
            <option value="">Return untouched videos to the pool</option>
            {otherPairs.map((p) => (
              <option key={p.id} value={p.id}>
                Move to {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2 pt-6 text-[13px] text-graphite">
          <input
            type="checkbox"
            checked={includeSubmitted}
            disabled={!toPairId}
            onChange={(e) => {
              setIncludeSubmitted(e.target.checked);
              setPreview(null);
            }}
            className="mt-0.5"
          />
          <span>
            Include videos where a departing coder already submitted scores
            (their scores are kept as evidence; the new pair codes the video
            again)
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={runPreview}
          className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:text-ash"
        >
          {pending && !preview ? "Looking…" : "Preview consequences"}
        </button>
        {error && (
          <p role="alert" className="text-[13px] text-clay">
            {error}
          </p>
        )}
      </div>

      {done && (
        <MomentCard>
          Done: {done.transferred} moved, {done.returned} returned to the pool,{" "}
          {done.held} left with the pair.
        </MomentCard>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-graphite">
            <span>
              <span className="mono text-ink">{preview.counts.transfer}</span> move
            </span>
            <span>
              <span className="mono text-ink">{preview.counts.return_to_pool}</span> back to pool
            </span>
            <span>
              <span className="mono text-ink">{preview.counts.hold}</span> stay
            </span>
            {preview.toPairId && (
              <span>
                seats: {preview.seats.anchor.from.label} → {preview.seats.anchor.to?.label};{" "}
                {preview.seats.enumerator.from.label} → {preview.seats.enumerator.to?.label}
              </span>
            )}
          </div>

          {preview.rows.length === 0 ? (
            <p className="text-[14px] text-graphite">This pair holds no active videos.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-hairline bg-paper">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-hairline">
                    <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke">Video</th>
                    <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke">State</th>
                    <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke">Result</th>
                    <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke">What happens</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.assignmentId} className="border-t border-hairline first:border-t-0">
                      <td className="video-code px-4 py-2 text-ink">{r.displayCode}</td>
                      <td className="px-4 py-2 text-graphite">{STATE_LABEL[r.state]}</td>
                      <td className="px-4 py-2 font-medium" style={{ color: ACTION_LABEL[r.action].color }}>
                        {ACTION_LABEL[r.action].text}
                      </td>
                      <td className="px-4 py-2 text-graphite">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {actionable > 0 && (
            <div className="space-y-3">
              <label className="block space-y-1 text-[13px] text-graphite">
                <span>Reason (written into the assignment log)</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-hairline-strong bg-paper px-3 py-2 text-[14px] text-ink"
                  placeholder="e.g. Simon leaves the project on 12 September"
                />
              </label>
              <button
                type="button"
                disabled={pending || reason.trim().length < 3}
                onClick={runConfirm}
                className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
              >
                {pending ? "Writing…" : `Confirm: move ${actionable} video${actionable === 1 ? "" : "s"}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
