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

const input =
  "rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-ash focus:border-hairline-strong";

function Message({ ok, text }: { ok: boolean; text: string | null }) {
  if (!text) return null;
  return (
    <p role={ok ? "status" : "alert"} className={`text-[14px] ${ok ? "text-forest" : "text-clay"}`}>
      {text}
    </p>
  );
}

type Upload = { name: string; text?: string; dataBase64?: string };

/** Batches of files whose total size stays under ~2.5 MB (server action limit). */
function batches(items: Upload[], maxBytes = 2_500_000, maxCount = 30): Upload[][] {
  const out: Upload[][] = [];
  let cur: Upload[] = [];
  let size = 0;
  for (const it of items) {
    const n = new Blob([it.text ?? it.dataBase64 ?? ""]).size;
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

async function readUpload(f: File): Promise<Upload> {
  if (/\.docx$/i.test(f.name)) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { name: f.name, dataBase64: btoa(bin) };
  }
  return { name: f.name, text: await f.text() };
}

export function ImportPanel() {
  const router = useRouter();
  const [files, setFiles] = useState<Upload[]>([]);
  const [practice, setPractice] = useState(false);
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const pick = async (list: FileList | null) => {
    setRows(null);
    setMsg(null);
    setFiles(await Promise.all([...(list ?? [])].map(readUpload)));
  };
  const preview = () =>
    start(async () => {
      const all: ImportPreviewRow[] = [];
      for (const b of batches(files)) {
        const r = await previewImportAction(b, practice);
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
      let loaded = 0;
      for (const b of batches(importable)) {
        const r = await confirmImportAction(b, practice);
        if (!r.ok) {
          setMsg({ ok: false, text: r.error ?? "Failed." });
          return;
        }
        loaded += r.loaded ?? 0;
      }
      setMsg({ ok: true, text: `${loaded} ${practice ? "practice " : ""}narrative${loaded === 1 ? "" : "s"} loaded.` });
      setFiles([]);
      setRows(null);
      router.refresh();
    });
  const n = rows?.filter((r) => r.importable).length ?? 0;
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-graphite">
        Choose the review script Word files (<code>…_SCRIPT_….docx</code>, one per lesson) or the pipeline&apos;s{" "}
        <code>NARRATIVE.md</code> files. The platform reads each lesson&apos;s ID (tr_id) from the file&apos;s own
        title. Nothing is saved until you press Load.
      </p>
      <input
        type="file"
        multiple
        accept=".docx,.md,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
        onChange={(e) => void pick(e.target.files)}
        className="block text-[14px]"
        aria-label="Review script Word files or NARRATIVE.md files"
      />
      <label className="flex items-start gap-2 text-[14px] text-ink">
        <input
          type="checkbox"
          checked={practice}
          onChange={(e) => {
            setPractice(e.target.checked);
            setRows(null);
          }}
          className="mt-1 size-4 accent-[var(--clobs-bark)]"
        />
        <span>
          <strong>Practice</strong> — for trying the platform. Practice narratives show as &ldquo;Practice&rdquo; on
          the enumerator&apos;s list and are left out of progress, downloads and the nightly Drive copy.
        </span>
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={!files.length || pending} onClick={preview} className={nxButtonClass("secondary")}>
          {pending && !rows ? "Checking…" : `Check ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
        </button>
        {rows && (
          <button type="button" disabled={!n || pending} onClick={confirm} className={nxButtonClass("primary")}>
            {pending ? "Loading…" : `Load ${n} ${practice ? "practice " : ""}narrative${n === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
      {rows && (
        <div className="elev-card overflow-x-auto rounded-xl border border-hairline bg-paper">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-card text-smoke">
              <tr>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Lesson (tr_id)</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Length</th>
                <th className="px-3 py-2 font-medium">Lines / episodes</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-hairline align-top">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="mono px-3 py-2">{r.lessonId ?? "not found"}</td>
                  <td className="px-3 py-2">{r.format === "script" ? "Review script" : "Narrative"}</td>
                  <td className="mono px-3 py-2">{r.duration}</td>
                  <td className="px-3 py-2 tabular-nums">{r.episodes}</td>
                  <td className="px-3 py-2">
                    {r.importable ? (
                      <span className="text-forest">New</span>
                    ) : r.duplicateOf ? (
                      <span className="text-graphite">Already loaded as {r.duplicateOf}</span>
                    ) : (
                      <span className="text-clay">Cannot load</span>
                    )}
                    {r.warnings.map((w, j) => (
                      <div key={j} className="text-clay">
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
    </div>
  );
}

/** How a video link was checked against its narrative (Amendment §61). */
export function VideoCheckBadge({ check, file }: { check: string | null; file: string | null }) {
  if (check === "drive") return <span className="text-forest">✓ Checked in Drive{file ? `: ${file}` : ""}</span>;
  if (check === "sheet") return <span className="text-forest">✓ Matches the sheet{file ? `: ${file}` : ""}</span>;
  return <span className="text-clay">Video not checked</span>;
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
      <p className="text-[14px] text-graphite">
        A CSV like <code>00_assignments.csv</code> with the columns <strong>order</strong>, <strong>reviewer</strong>{" "}
        (email or full name), <strong>video_id</strong> (the lesson&apos;s tr_id), <strong>video_file</strong> and{" "}
        <strong>video_drive_id</strong> (or <strong>video_link</strong>). Other columns are ignored. Every video is
        checked against the lesson in the narrative&apos;s own title; a row whose video belongs to another lesson
        cannot be assigned.
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
        <div className="elev-card overflow-x-auto rounded-xl border border-hairline bg-paper">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-card text-smoke">
              <tr>
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 font-medium">Reviewer</th>
                <th className="px-3 py-2 font-medium">Shows as</th>
                <th className="px-3 py-2 font-medium">Lesson (tr_id)</th>
                <th className="px-3 py-2 font-medium">School (sid)</th>
                <th className="px-3 py-2 font-medium">Video</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className="border-t border-hairline align-top">
                  <td className="px-3 py-2 tabular-nums">{r.line}</td>
                  <td className="px-3 py-2">{r.assigneeName ?? r.reviewer}</td>
                  <td className="px-3 py-2">{r.orderNo !== null ? `Video ${r.orderNo}` : ""}</td>
                  <td className="mono px-3 py-2">{r.lessonId ?? r.lesson}</td>
                  <td className="mono px-3 py-2">{r.sid ?? ""}</td>
                  <td className="px-3 py-2">
                    {!r.videoUrl ? (
                      <span className="text-clay">No link</span>
                    ) : r.problems.length ? (
                      <span className="break-all">{r.sheetFile ?? "link given"}</span>
                    ) : (
                      <VideoCheckBadge check={r.videoCheck} file={r.videoFile} />
                    )}
                    {r.videoNote && <div className="text-[12px] text-smoke">{r.videoNote}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {r.problems.length ? (
                      <span className="text-clay">{r.problems.join("; ")}</span>
                    ) : (
                      <span className="text-forest">Ready</span>
                    )}
                  </td>
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

/**
 * Assign one narrative. Choosing a reviewer fills in their next free order
 * number: the enumerator sees it as "Video <order>", so it must be unused.
 */
export function AssignInline({
  narrativeId,
  reviewers,
  nextOrders,
}: {
  narrativeId: string;
  reviewers: Reviewer[];
  nextOrders: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("");
  const [order, setOrder] = useState("1");
  const [link, setLink] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={nxButtonClass("pill")}>
        Assign
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <select
        aria-label="Reviewer"
        value={who}
        onChange={(e) => {
          setWho(e.target.value);
          setOrder(String(nextOrders[e.target.value] ?? 1));
        }}
        className={input}
      >
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
          className={nxButtonClass("primary", "!px-3 !py-1.5 !text-[13px]")}
        >
          Assign
        </button>
        <button type="button" onClick={() => setOpen(false)} className={nxButtonClass("ghost", "text-[13px]")}>
          Cancel
        </button>
      </div>
      {err && <p className="text-[13px] text-clay">{err}</p>}
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
          <h3 className="text-[15px] font-semibold text-ink">Reopen for changes</h3>
          <p className="mt-1 text-[13px] text-smoke">The reviewer can edit again. The submitted version stays in history.</p>
          <textarea aria-label="Reason for reopening" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why (required)" className={`${input} mt-2 w-full`} />
          <button type="button" disabled={pending || !reason.trim()} onClick={() => run(() => reopenAction(assignmentId, reason))} className={nxButtonClass("secondary", "mt-2")}>
            Reopen
          </button>
        </section>
      )}
      {status !== "submitted" && (
        <section>
          <h3 className="text-[15px] font-semibold text-ink">Reassign</h3>
          <p className="mt-1 text-[13px] text-smoke">The new reviewer continues from the current text. This assignment is kept in the record.</p>
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
        <h3 className="text-[15px] font-semibold text-ink">Order and video link</h3>
        <div className="mt-2 flex gap-2">
          <input aria-label="Order" type="number" min={1} value={order} onChange={(e) => setOrder(e.target.value)} className={`${input} w-20`} />
          <input aria-label="Video link" value={link} onChange={(e) => setLink(e.target.value)} className={`${input} min-w-0 flex-1`} />
        </div>
        <button type="button" disabled={pending} onClick={() => run(() => updateAssignmentAction(assignmentId, Number(order), link))} className={nxButtonClass("secondary", "mt-2")}>
          Save
        </button>
      </section>
      <section>
        <h3 className="text-[15px] font-semibold text-ink">Withdraw this narrative</h3>
        <p className="mt-1 text-[13px] text-smoke">Hides it from everyone. Nothing is deleted.</p>
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
      className={nxButtonClass("pill")}
    >
      Restore
    </button>
  );
}
