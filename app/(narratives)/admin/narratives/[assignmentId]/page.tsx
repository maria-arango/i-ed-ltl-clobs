/**
 * /admin/narratives/:assignmentId — one review as the admin sees it:
 * the document read-only, answers, comments, measured time, version
 * history (with restore), and reopen / reassign / withdraw.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getAdminNarrative, listReviewers, listRevisions } from "@/lib/db/admin-narratives";
import { anchoredCommentIds, docStats } from "@/lib/narratives/doc";
import { answerFields } from "@/lib/narratives/template";
import { DocView } from "@/components/narratives/doc-view";
import { NxCard, NxStatus } from "@/components/narratives/nx-ui";
import { AssignmentActions, RestoreButton } from "@/components/narratives/admin/panels";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ assignmentId: string }> };

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const KIND: Record<string, string> = {
  import: "Starting text",
  snapshot: "Autosave snapshot",
  submit: "Submitted",
  reopen: "Reopened",
  restore: "Restored",
  conflict_copy: "Copy kept from a conflict",
};

export default async function AdminNarrative({ params }: Params) {
  await requireAdmin();
  const { assignmentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) notFound();
  const v = await getAdminNarrative(assignmentId);
  if (!v) notFound();
  const [revisions, reviewers] = await Promise.all([listRevisions(assignmentId), listReviewers()]);
  const stats = docStats(v.doc, v.comments, v.initialDoc);
  const anchored = anchoredCommentIds(v.doc);
  const numbers = new Map(v.comments.map((c, i) => [c.id, i + 1]));
  const fields = v.template ? answerFields(v.template) : [];

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <Link href="/admin/narratives" className="font-medium text-nx-accent hover:underline">
          ← Narratives
        </Link>
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold">{v.displayCode}</h1>
        <span className="text-[15px] text-nx-muted">
          {v.lessonId ?? "lesson ID removed"} · {v.durationLabel} · {v.assigneeName} · order {v.orderNo}
        </span>
        <NxStatus status={v.status} />
        <a
          href={`/api/admin/narratives/${v.assignmentId}/docx`}
          className="ml-auto rounded-md bg-nx-accent px-3.5 py-2 text-[14px] font-medium text-white hover:bg-nx-accent-hover"
        >
          Download Word
        </a>
      </div>
      {v.status === "returned" && (
        <p className="mt-2 text-[14px] text-nx-muted">This assignment was moved: {v.statusReason}</p>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,816px)_1fr]">
        <div className="rounded-sm border border-nx-border bg-nx-surface px-6 py-8 sm:px-12">
          {fields.length > 0 && (
            <section aria-label="Answers" className="mb-8 space-y-4">
              {fields.map((f) => (
                <div key={f.key}>
                  {f.title && <h2 className="text-[16px] font-bold">{f.title}</h2>}
                  <p className="text-[13px] text-nx-muted">{f.prompt.slice(0, 160)}{f.prompt.length > 160 ? "…" : ""}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[15px]">
                    {(v.answers as Record<string, string | undefined>)[f.key]?.trim() || <span className="text-nx-muted">No answer</span>}
                  </p>
                </div>
              ))}
            </section>
          )}
          <DocView doc={v.doc} commentNumbers={numbers} />
        </div>

        <div className="space-y-6">
          <NxCard className="p-4 text-[14px]">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-nx-muted">Time worked</dt>
              <dd className="tabular-nums">{v.activeMinutes} min</dd>
              <dt className="text-nx-muted">First opened</dt>
              <dd>{fmt(v.firstStart)}</dd>
              <dt className="text-nx-muted">Last saved</dt>
              <dd>{fmt(v.updatedAt)}</dd>
              <dt className="text-nx-muted">Submitted</dt>
              <dd>{fmt(v.submittedAt)}</dd>
              <dt className="text-nx-muted">Red characters</dt>
              <dd className="tabular-nums">{stats.redChars}</dd>
              <dt className="text-nx-muted">Struck characters</dt>
              <dd className="tabular-nums">{stats.struckChars}</dd>
              <dt className="text-nx-muted">Original words deleted</dt>
              <dd className={`tabular-nums ${stats.originalWordsRemoved ? "font-semibold text-nx-warn" : ""}`}>{stats.originalWordsRemoved}</dd>
              <dt className="text-nx-muted">Video</dt>
              <dd className="truncate">
                {v.videoUrl ? (
                  <a href={v.videoUrl} target="_blank" rel="noopener noreferrer" className="text-nx-accent hover:underline">
                    Open
                  </a>
                ) : (
                  "none"
                )}
              </dd>
            </dl>
          </NxCard>

          <NxCard className="p-4">
            <h2 className="text-[16px] font-semibold">Comments ({v.comments.length})</h2>
            {v.comments.length === 0 ? (
              <p className="mt-2 text-[14px] text-nx-muted">None.</p>
            ) : (
              <ol className="mt-2 space-y-3 text-[14px]">
                {v.comments.map((c) => (
                  <li key={c.id}>
                    <div className="flex gap-2 text-[13px] text-nx-muted">
                      <span className="font-semibold text-nx-accent">{numbers.get(c.id)}</span>
                      <span>{c.authorName}</span>
                      <span>{fmt(new Date(c.updatedAt))}</span>
                      {!anchored.has(c.id) && <span className="text-nx-warn">text removed</span>}
                    </div>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </NxCard>

          {v.status !== "returned" && (
            <NxCard className="p-4">
              <AssignmentActions
                assignmentId={v.assignmentId}
                narrativeId={v.narrativeId}
                status={v.status}
                orderNo={v.orderNo}
                videoUrl={v.videoUrl}
                assigneeId={v.assigneeId}
                reviewers={reviewers}
              />
            </NxCard>
          )}

          <NxCard className="overflow-x-auto p-4">
            <h2 className="text-[16px] font-semibold">Version history</h2>
            <p className="mt-1 text-[13px] text-nx-muted">Every version is kept. Restoring makes a new version; nothing is overwritten.</p>
            <table className="mt-3 w-full text-left text-[13px]">
              <thead className="text-nx-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">When</th>
                  <th className="py-1.5 pr-3 font-medium">What</th>
                  <th className="py-1.5 pr-3 font-medium">Size</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.id} className="border-t border-nx-border">
                    <td className="py-1.5 pr-3">{fmt(r.createdAt)}</td>
                    <td className="py-1.5 pr-3">
                      {KIND[r.kind] ?? r.kind}
                      {r.createdByName ? <span className="text-nx-muted"> · {r.createdByName}</span> : null}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{typeof r.stats?.totalChars === "number" ? `${r.stats.totalChars} ch` : ""}</td>
                    <td className="py-1.5 text-right">
                      {v.status !== "returned" && (
                        <RestoreButton assignmentId={v.assignmentId} revisionId={r.id} disabled={v.status === "submitted"} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </NxCard>
        </div>
      </div>
    </main>
  );
}
