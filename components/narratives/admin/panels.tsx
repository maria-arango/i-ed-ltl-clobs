"use client";
/**
 * Admin panels for the Narratives dashboard: load NARRATIVE.md files,
 * assign from a sheet, assign one narrative, and the per-narrative actions
 * (reassign, reopen, change order/link, restore a version, withdraw).
 * Every write goes through a server action that re-checks the admin session.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  assignAction,
  backupNowAction,
  confirmImportAction,
  confirmSheetAction,
  previewImportAction,
  previewSheetAction,
  reassignAction,
  reopenAction,
  restoreAction,
  updateAssignmentAction,
  voidAction,
} from "@/app/(narratives)/admin/narratives/actions";
import type { ImportPreviewRow, Reviewer, SheetRowPreview } from "@/lib/db/admin-narratives";
import { nxButtonClass } from "../nx-ui";

const input = "rounded-md border border-nx-border-strong bg-nx-surface px-2.5 py-1.5 text-[14px]";

function Message({ ok, text }: { ok: boolean; text: string | null }) {
  if (!text) return null;
  return (
    <p role={ok ? "status" : "alert"} className={`text-[14px] ${ok ? "text-nx-success" : "text-nx-danger"}`}>
      {text}
    </p>
  );
}

/** Batches of files whose total text stays under ~2.5 MB (server action limit). */
function batches<T extends { text: string }>(items: T[], maxBytes = 2_500_000, maxCount = 30): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let size = 0;
  for (const it of items) {
    const n = new Blob([it.text]).size;
    if (cur.length && (size + n > maxBytes || cur.length >= maxCount)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(it);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

export function ImportPanel() {
  const router = useRouter();
  const [files, setFiles] = useState<Array<{ name: string; text: string }>>([]);
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null);
  const [codes, setCodes] = useState<Array<{ displayCode: string; lessonId: string; file: string }>>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const pick = async (list: FileList | null) => {
    setRows(null);
    setMsg(null);
    const read = await Promise.all([...(list ?? [])].map(async (f) => ({ name: f.name, text: await f.text() })));
    setFiles(read);
  };
  const preview = () =>
    start(async () => {
      const all: ImportPreviewRow[] = [];
      for (const b of batches(files)) {
        const r = await previewImportAction(b);
        if ("error" in r) {
          setMsg({ ok: false, text: r.error });
          return;
        }
        all.push(...r);
      }
      setRows(all);
    });
  const confirm = () =>
    start(async () => {
      const importable = files.filter((_, i) => rows?.[i]?.importable);
      const got: Array<{ displayCode: string; lessonId: string; file: string }> = [];
      for (const b of batches(importable)) {
        const r = await confirmImportAction(b);
        if (!r.ok) {
          setMsg({ ok: false, text: r.error ?? "Failed." });
          setCodes(got);
          return;
        }
        got.push(...(r.codes ?? []));
      }
      setCodes(got);
      setMsg({ ok: true, text: `${got.length} narrative${got.length === 1 ? "" : "s"} loaded.` });
      setFiles([]);
      setRows(null);
      router.refresh();
    });
  const n = rows?.filter((r) => r.importable).length ?? 0;
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-nx-muted">
        Choose the pipeline&apos;s <code>NARRATIVE.md</code> files (one per lesson). Nothing is saved until you press Load.
      </p>
      <input
        type="file"
        multiple
        accept=".md,.txt,text/plain,text/markdown"
        onChange={(e) => void pick(e.target.files)}
        className="block text-[14px]"
        aria-label="NARRATIVE.md files"
      />
      <p className="text-[14px]">
        Lesson IDs are removed from every narrative: the platform stores none, and each narrative is known by its
        code (N-0001…). After loading you can download the list of which code is which lesson. Save it in the
        Harvard Drive; the platform does not keep it.
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={!files.length || pending} onClick={preview} className={nxButtonClass("secondary")}>
          {pending && !rows ? "Checking…" : `Check ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
        </button>
        {rows && (
          <button type="button" disabled={!n || pending} onClick={confirm} className={nxButtonClass("primary")}>
            {pending ? "Loading…" : `Load ${n} narrative${n === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
      {rows && (
        <div className="overflow-x-auto rounded-md border border-nx-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-nx-sunken text-nx-muted">
              <tr>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Lesson</th>
                <th className="px-3 py-2 font-medium">Length</th>
                <th className="px-3 py-2 font-medium">Episodes</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-nx-border align-top">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.lessonId ?? "not found"}</td>
                  <td className="px-3 py-2 tabular-nums">{r.duration}</td>
                  <td className="px-3 py-2 tabular-nums">{r.episodes}</td>
                  <td className="px-3 py-2">
                    {r.importable ? (
                      <span className="text-nx-success">New</span>
                    ) : r.duplicateOf ? (
                      <span className="text-nx-muted">Already loaded as {r.duplicateOf}</span>
                    ) : (
                      <span className="text-nx-danger">Cannot load</span>
                    )}
                    {r.warnings.map((w, j) => (
                      <div key={j} className="text-nx-warn">
                        {w}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Message ok={msg?.ok ?? true} text={msg?.text ?? null} />
      {codes.length > 0 && <CodeListDownload codes={codes} />}
    </div>
  );
}

/** The code ↔ lesson list, built in the browser from this import only. */
function CodeListDownload({ codes }: { codes: Array<{ displayCode: string; lessonId: string; file: string }> }) {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv =
    "\uFEFFcode,lesson_id,file\r\n" +
    codes.map((c) => [c.displayCode, c.lessonId, c.file].map(cell).join(",")).join("\r\n") +
    "\r\n";
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  return (
    <div className="rounded-md border border-nx-warn bg-nx-warn-wash px-3 py-2 text-[14px]">
      <a href={href} download={`narrative-codes_${new Date().toISOString().slice(0, 10)}.csv`} className="font-medium text-nx-accent underline">
        Download the code list ({codes.length})
      </a>{" "}
      and save it in the Harvard Drive now. It is shown only once and is not stored in the platform.
    </div>
  );
}

export function BackupNowButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await backupNowAction();
            setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Done.") : (r.error ?? "Failed.") });
          })
        }
        className={nxButtonClass("secondary")}
      >
        {pending ? "Copying…" : "Copy everything to the Harvard Drive now"}
      </button>
      <Message ok={msg?.ok ?? true} text={msg?.text ?? null} />
    </div>
  );
}

export function SheetPanel() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<SheetRowPreview[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const ok = rows?.filter((r) => r.problems.length === 0).length ?? 0;
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-nx-muted">
        A CSV with the columns <strong>order</strong>, <strong>reviewer</strong> (email or full name),{" "}
        <strong>video_id</strong> (lesson ID or N-code) and <strong>video_drive_id</strong> or{" "}
        <strong>video_link</strong>, like <code>00_assignments.csv</code>.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="Assignment sheet (CSV)"
        className="block text-[14px]"
        onChange={async (e) => {
          setRows(null);
          setMsg(null);
          setCsv((await e.target.files?.[0]?.text()) ?? "");
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!csv || pending}
          onClick={() => start(async () => setRows(await previewSheetAction(csv)))}
          className={nxButtonClass("secondary")}
        >
          Check sheet
        </button>
        {rows && (
          <button
            type="button"
            disabled={!ok || pending}
            onClick={() =>
              start(async () => {
                const r = await confirmSheetAction(csv);
                setMsg({ ok: r.ok, text: r.message ?? r.error ?? "" });
                setRows(null);
                router.refresh();
              })
            }
            className={nxButtonClass("primary")}
          >
            Assign {ok} narrative{ok === 1 ? "" : "s"}
          </button>
        )}
      </div>
      {rows && (
        <div className="overflow-x-auto rounded-md border border-nx-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-nx-sunken text-nx-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Reviewer</th>
                <th className="px-3 py-2 font-medium">Narrative</th>
                <th className="px-3 py-2 font-medium">Video link</th>
                <th className="px-3 py-2 font-medium">Problems</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className="border-t border-nx-border align-top">
                  <td className="px-3 py-2 tabular-nums">{r.line}</td>
                  <td className="px-3 py-2 tabular-nums">{r.orderNo ?? ""}</td>
                  <td className="px-3 py-2">{r.assigneeName ?? r.reviewer}</td>
                  <td className="px-3 py-2">{r.narrativeCode ?? r.lesson}</td>
                  <td className="px-3 py-2">{r.videoUrl ? "Yes" : "None"}</td>
                  <td className="px-3 py-2 text-nx-danger">{r.problems.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Message ok={msg?.ok ?? true} text={msg?.text ?? null} />
    </div>
  );
}

export function AssignInline({ narrativeId, reviewers, nextOrder }: { narrativeId: string; reviewers: Reviewer[]; nextOrder: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("");
  const [order, setOrder] = useState(String(nextOrder));
  const [link, setLink] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={nxButtonClass("secondary", "px-2.5 py-1 text-[13px]")}>
        Assign
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <select aria-label="Reviewer" value={who} onChange={(e) => setWho(e.target.value)} className={input}>
        <option value="">Choose a reviewer…</option>
        {reviewers.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name || r.email}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input aria-label="Order" type="number" min={1} value={order} onChange={(e) => setOrder(e.target.value)} className={`${input} w-20`} />
        <input aria-label="Video link or Drive file id" placeholder="Video link or Drive id" value={link} onChange={(e) => setLink(e.target.value)} className={`${input} min-w-0 flex-1`} />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!who || pending}
          onClick={() =>
            start(async () => {
              const r = await assignAction(narrativeId, who, Number(order), link);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              } else setErr(r.error ?? "Failed.");
            })
          }
          className={nxButtonClass("primary", "px-2.5 py-1 text-[13px]")}
        >
          Assign
        </button>
        <button type="button" onClick={() => setOpen(false)} className={nxButtonClass("ghost", "px-2.5 py-1 text-[13px]")}>
          Cancel
        </button>
      </div>
      {err && <p className="text-[13px] text-nx-danger">{err}</p>}
    </div>
  );
}

export function AssignmentActions({
  assignmentId,
  narrativeId,
  status,
  orderNo,
  videoUrl,
  assigneeId,
  reviewers,
}: {
  assignmentId: string;
  narrativeId: string;
  status: string;
  orderNo: number;
  videoUrl: string | null;
  assigneeId: string;
  reviewers: Reviewer[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [to, setTo] = useState("");
  const [order, setOrder] = useState(String(orderNo));
  const [link, setLink] = useState(videoUrl ?? "");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; assignmentId?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Done.") : (r.error ?? "Failed.") });
      if (r.ok && r.assignmentId) router.push(`/admin/narratives/${r.assignmentId}`);
      else router.refresh();
    });
  return (
    <div className="space-y-5">
      {status === "submitted" && (
        <section>
          <h3 className="text-[15px] font-semibold">Reopen for changes</h3>
          <p className="mt-1 text-[13px] text-nx-muted">The reviewer can edit again. The submitted version stays in history.</p>
          <textarea aria-label="Reason for reopening" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why (required)" className={`${input} mt-2 w-full`} />
          <button type="button" disabled={pending || !reason.trim()} onClick={() => run(() => reopenAction(assignmentId, reason))} className={nxButtonClass("secondary", "mt-2")}>
            Reopen
          </button>
        </section>
      )}
      {status !== "submitted" && (
        <section>
          <h3 className="text-[15px] font-semibold">Reassign</h3>
          <p className="mt-1 text-[13px] text-nx-muted">The new reviewer continues from the current text. This assignment is kept in the record.</p>
          <select aria-label="New reviewer" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} mt-2 w-full`}>
            <option value="">Choose a reviewer…</option>
            {reviewers.filter((r) => r.id !== assigneeId).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || r.email}
              </option>
            ))}
          </select>
          <textarea aria-label="Reason for reassigning" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why (required)" className={`${input} mt-2 w-full`} />
          <button type="button" disabled={pending || !to || !reason.trim()} onClick={() => run(() => reassignAction(assignmentId, to, reason))} className={nxButtonClass("secondary", "mt-2")}>
            Reassign
          </button>
        </section>
      )}
      <section>
        <h3 className="text-[15px] font-semibold">Order and video link</h3>
        <div className="mt-2 flex gap-2">
          <input aria-label="Order" type="number" min={1} value={order} onChange={(e) => setOrder(e.target.value)} className={`${input} w-20`} />
          <input aria-label="Video link" value={link} onChange={(e) => setLink(e.target.value)} className={`${input} min-w-0 flex-1`} />
        </div>
        <button type="button" disabled={pending} onClick={() => run(() => updateAssignmentAction(assignmentId, Number(order), link))} className={nxButtonClass("secondary", "mt-2")}>
          Save
        </button>
      </section>
      <section>
        <h3 className="text-[15px] font-semibold">Withdraw this narrative</h3>
        <p className="mt-1 text-[13px] text-nx-muted">Hides it from everyone. Nothing is deleted.</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const why = window.prompt("Why is this narrative withdrawn?");
            if (why?.trim()) run(() => voidAction(narrativeId, why));
          }}
          className={nxButtonClass("danger", "mt-2")}
        >
          Withdraw
        </button>
      </section>
      <Message ok={msg?.ok ?? true} text={msg?.text ?? null} />
    </div>
  );
}

export function RestoreButton({ assignmentId, revisionId, disabled }: { assignmentId: string; revisionId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      title={disabled ? "Reopen the narrative before restoring a version" : undefined}
      onClick={() => {
        if (!window.confirm("Put this version back as the working copy? The current version stays in history.")) return;
        start(async () => {
          const r = await restoreAction(assignmentId, revisionId);
          if (!r.ok) window.alert(r.error);
          router.refresh();
        });
      }}
      className={nxButtonClass("secondary", "px-2.5 py-1 text-[13px]")}
    >
      Restore
    </button>
  );
}
