"use client";
/**
 * Bulk Drive-link attachment: paste "filename  link" lines (from the
 * spreadsheet or a Drive listing), preview the prefix matches, resolve
 * anything ambiguous (the duplicate-session teachers), confirm. Plus a
 * one-at-a-time attach by display code.
 */
import { useActionState, useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  attachSingleAction,
  confirmLinksAction,
  previewLinksAction,
  type LinkPreviewResult,
  type SingleAttachResult,
} from "./actions";

const inputCls =
  "rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink focus:border-hairline-strong";

export function LinkAttacher() {
  const [previewState, previewAction, previewPending] = useActionState<
    LinkPreviewResult | null,
    FormData
  >(previewLinksAction, null);
  const [choices, setChoices] = useState<Record<string, string>>({}); // filename → videoId
  const [confirmPending, startConfirm] = useTransition();
  const [confirmResult, setConfirmResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const preview = previewState?.ok ? previewState.preview : undefined;

  function confirm() {
    if (!preview) return;
    const links = [
      ...preview.matched.map((m) => ({ videoId: m.videoId, url: m.url })),
      ...preview.ambiguous
        .filter((a) => choices[a.filename])
        .map((a) => ({ videoId: choices[a.filename], url: a.url })),
    ];
    startConfirm(async () => {
      setConfirmResult(null);
      const r = await confirmLinksAction(links);
      setConfirmResult(
        r.ok
          ? { kind: "ok", text: `${r.attached} Drive link${r.attached === 1 ? "" : "s"} attached.` }
          : { kind: "error", text: r.error ?? "Something went wrong" },
      );
    });
  }

  return (
    <section aria-label="Attach Drive links" className="space-y-4">
      <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
        <h3 className="text-[15px] font-medium text-ink">Attach Drive links in bulk</h3>
        <p className="mt-1 text-[13px] leading-[1.5] text-graphite">
          One file per line: the combined file&apos;s name and its Drive link,
          in any order (copy the two columns straight from a spreadsheet).
          Files are matched to sessions by their sid_tr-id prefix. Nothing is
          written until you confirm the preview.
        </p>
        <form action={previewAction} className="mt-3 space-y-3">
          <textarea
            name="lines"
            rows={6}
            placeholder={"11002_11002_29_11_EAST_BIOLOGY_comp.mp4  https://drive.google.com/file/d/…"}
            className={`mono block w-full ${inputCls} text-[12px]`}
          />
          <div className="flex items-center justify-between gap-4">
            <span aria-live="polite" className="text-[13px]">
              {previewState && !previewState.ok && (
                <span className="text-clay">{previewState.error}</span>
              )}
            </span>
            <button
              type="submit"
              disabled={previewPending}
              className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:text-ash"
            >
              {previewPending ? "Matching…" : "Preview matches"}
            </button>
          </div>
        </form>
      </div>

      {preview && (
        <div className="elev-card space-y-4 rounded-2xl border border-hairline-strong bg-paper p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[15px] font-medium text-ink">Preview</h4>
            <p className="text-[13px] text-graphite">
              {preview.matched.length} matched
              {preview.ambiguous.length > 0 && ` · ${preview.ambiguous.length} need a choice`}
              {preview.unmatched.length > 0 && ` · ${preview.unmatched.length} unmatched`}
              {preview.invalidLines.length > 0 && ` · ${preview.invalidLines.length} unreadable`}
            </p>
          </div>

          {preview.matched.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow header>
                  <TableHead>File</TableHead>
                  <TableHead>Video</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.matched.map((m) => (
                  <TableRow key={m.filename + m.videoId}>
                    <TableCell className="mono text-[12px] text-graphite">
                      {m.filename}
                    </TableCell>
                    <TableCell>
                      <span className="video-code text-ink">{m.displayCode}</span>
                    </TableCell>
                    <TableCell className="text-[12px] text-smoke">
                      {m.replacesExisting ? "Replaces the current link" : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {preview.ambiguous.length > 0 && (
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-ink">
                These files match more than one session (the duplicate-session
                teachers). Pick the right video for each:
              </p>
              {preview.ambiguous.map((a) => (
                <div
                  key={a.filename}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-card px-3 py-2"
                >
                  <span className="mono text-[12px] text-graphite">{a.filename}</span>
                  <select
                    value={choices[a.filename] ?? ""}
                    onChange={(e) =>
                      setChoices((prev) => ({ ...prev, [a.filename]: e.target.value }))
                    }
                    className={inputCls}
                    aria-label={`Video for ${a.filename}`}
                  >
                    <option value="">Skip this file</option>
                    {a.candidates.map((c) => (
                      <option key={c.videoId} value={c.videoId}>
                        {c.displayCode} · {c.rawFilename}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {preview.unmatched.length > 0 && (
            <p className="text-[13px] text-graphite">
              No session found for:{" "}
              <span className="mono text-[12px]">{preview.unmatched.join(", ")}</span>
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            <span aria-live="polite" className="text-[13px]">
              {confirmResult?.kind === "error" && (
                <span className="text-clay">{confirmResult.text}</span>
              )}
              {confirmResult?.kind === "ok" && (
                <span style={{ color: "var(--clobs-forest)" }}>{confirmResult.text}</span>
              )}
            </span>
            <button
              type="button"
              disabled={confirmPending || preview.matched.length + Object.values(choices).filter(Boolean).length === 0}
              onClick={confirm}
              className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
            >
              {confirmPending ? "Attaching…" : "Attach these links"}
            </button>
          </div>
        </div>
      )}

      <SingleAttach />
    </section>
  );
}

function SingleAttach() {
  const [state, action, pending] = useActionState<SingleAttachResult | null, FormData>(
    attachSingleAction,
    null,
  );
  return (
    <div className="elev-card rounded-2xl border border-hairline bg-card p-6">
      <h3 className="text-[15px] font-medium text-ink">Attach one link by code</h3>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-[14px] font-medium text-ink">
          Display code
          <input
            name="displayCode"
            placeholder="V-0417"
            className={`video-code mt-1 block w-36 ${inputCls}`}
          />
        </label>
        <label className="block min-w-72 flex-1 text-[14px] font-medium text-ink">
          Drive link
          <input
            name="url"
            placeholder="https://drive.google.com/file/d/…"
            className={`mono mt-1 block w-full ${inputCls} text-[12px]`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:text-ash"
        >
          {pending ? "Attaching…" : "Attach"}
        </button>
      </form>
      <p aria-live="polite" className="mt-2 text-[13px]">
        {state && !state.ok && <span className="text-clay">{state.error}</span>}
        {state?.ok && (
          <span style={{ color: "var(--clobs-forest)" }}>
            Link attached to {state.displayCode}.
          </span>
        )}
      </p>
    </div>
  );
}
