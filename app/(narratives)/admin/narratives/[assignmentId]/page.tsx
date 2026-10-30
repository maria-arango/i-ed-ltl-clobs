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
import { VideoCheckBadge } from "@/components/narratives/admin/panels";
import { DocView } from "@/components/narratives/doc-view";
import { NxCard, NxStatus, nxButtonClass } from "@/components/narratives/nx-ui";
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
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href="/admin/narratives" className="rounded-sm text-lake underline underline-offset-4">
          Narratives
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">{v.lessonId ?? v.displayCode}</span>
      </nav>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1
          className="mono font-medium text-ink"
          style={{ fontSize: "var(--clobs-text-heading)", lineHeight: "var(--clobs-leading-heading)" }}
        >
          {v.lessonId ?? v.displayCode}
        </h1>
        <span className="text-[14px] text-smoke">
          {v.sid ? `School ${v.sid} · ` : ""}
          {v.durationLabel ? `${v.durationLabel} · ` : ""}
          {v.assigneeName} · shows as {v.practice ? "Practice" : `Video ${v.orderNo}`}
        </span>
        <NxStatus status={v.status} />
        <a href={`/api/admin/narratives/${v.assignmentId}/docx`} className={nxButtonClass("primary", "ml-auto")}>
          Download Word
        </a>
      </header>
      {v.status === "returned" && (
        <p className="mt-2 text-[14px] text-graphite">This assignment was moved: {v.statusReason}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border border-hairline bg-paper px-6 py-8 sm:px-12">
          {fields.length > 0 && (
            <section aria-label="Answers" className="mb-8 space-y-4">
              {fields.map((f) => (
                <div key={f.key}>
                  {f.title && <h2 className="text-[16px] font-semibold text-ink">{f.title}</h2>}
                  <p className="text-[13px] text-smoke">{f.prompt.slice(0, 160)}{f.prompt.length > 160 ? "…" : ""}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[15px] text-ink">
                    {(v.answers as Record<string, string | undefined>)[f.key]?.trim() || <span className="text-graphite">No answer</span>}
                  </p>
                </div>
              ))}
            </section>
          )}
          <DocView doc={v.doc} commentNumbers={numbers} />
        </div>

        <div className="space-y-6">
          <NxCard className="p-5 text-[14px]">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-smoke">Time worked</dt>
              <dd className="tabular-nums">{v.activeMinutes} min</dd>
              <dt className="text-smoke">First opened</dt>
              <dd>{fmt(v.firstStart)}</dd>
              <dt className="text-smoke">Last saved</dt>
              <dd>{fmt(v.updatedAt)}</dd>
              <dt className="text-smoke">Submitted</dt>
              <dd>{fmt(v.submittedAt)}</dd>
              <dt className="text-smoke">Red characters</dt>
              <dd className="tabular-nums">{stats.redChars}</dd>
              <dt className="text-smoke">Struck characters</dt>
              <dd className="tabular-nums">{stats.struckChars}</dd>
              <dt className="text-smoke">Original words deleted</dt>
              <dd className={`tabular-nums ${stats.originalWordsRemoved ? "font-semibold text-clay" : ""}`}>{stats.originalWordsRemoved}</dd>
              <dt className="text-smoke">Video</dt>
              <dd className="truncate">
                {v.videoUrl ? (
                  <a href={v.videoUrl} target="_blank" rel="noopener noreferrer" className="text-lake hover:underline">
                    Open
                  </a>
                ) : (
                  "none"
                )}
              </dd>
            </dl>
            {v.videoUrl && (
              <p className="mt-3 break-all text-[13px]">
                <VideoCheckBadge check={v.videoCheck} file={v.videoFile} />
              </p>
            )}
          </NxCard>

          <NxCard className="p-5">
            <h2 className="text-[16px] font-semibold text-ink">Comments ({v.comments.length})</h2>
            {v.comments.length === 0 ? (
              <p className="mt-2 text-[14px] text-graphite">None.</p>
            ) : (
              <ol className="mt-2 space-y-3 text-[14px]">
                {v.comments.map((c) => (
                  <li key={c.id}>
                    <div className="flex gap-2 text-[13px] text-graphite">
                      <span className="font-semibold text-lake">{numbers.get(c.id)}</span>
                      <span>{c.authorName}</span>
                      <span>{fmt(new Date(c.updatedAt))}</span>
                      {!anchored.has(c.id) && <span className="text-clay">text removed</span>}
                    </div>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </NxCard>

          {v.status !== "returned" && (
            <NxCard className="p-5">
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

          <NxCard className="overflow-x-auto p-5">
            <h2 className="text-[16px] font-semibold text-ink">Version history</h2>
            <p className="mt-1 text-[13px] text-smoke">Every version is kept. Restoring makes a new version; nothing is overwritten.</p>
            <table className="mt-3 w-full text-left text-[13px]">
              <thead className="text-graphite">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">When</th>
                  <th className="py-1.5 pr-3 font-medium">What</th>
                  <th className="py-1.5 pr-3 font-medium">Size</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.id} className="border-t border-hairline">
                    <td className="py-1.5 pr-3">{fmt(r.createdAt)}</td>
                    <td className="py-1.5 pr-3">
                      {KIND[r.kind] ?? r.kind}
                      {r.createdByName ? <span className="text-graphite"> · {r.createdByName}</span> : null}
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
    </div>
  );
}
