/**
 * /narratives/:assignmentId — one narrative in the Word-like editor
 * (Amendments §51–§52). Server side: access check and the current server
 * copy; everything else (device drafts, sync, tab lock) is client side.
 */
import { notFound } from "next/navigation";
import { requireNarrativesAccess } from "@/lib/auth-helpers";
import { getDisplayName, getMyNarrative } from "@/lib/db/narratives";
import { NarrativeWorkspace } from "@/components/narratives/narrative-workspace";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ assignmentId: string }> };

export default async function NarrativePage({ params }: Params) {
  const { session } = await requireNarrativesAccess();
  const { assignmentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) notFound();
  const n = await getMyNarrative(session.user.id, assignmentId);
  if (!n) notFound();
  const userName = await getDisplayName(session.user.id);
  return (
    <NarrativeWorkspace
      userId={session.user.id}
      userName={userName}
      narrative={{ ...n, updatedAt: n.updatedAt.toISOString() }}
    />
  );
}
