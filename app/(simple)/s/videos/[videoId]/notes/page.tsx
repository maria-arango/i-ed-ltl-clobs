import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-helpers";
import { getWorkspace } from "@/lib/db/coder";
import { NotesEditor } from "@/components/workspace/notes-editor";

export default async function SimpleNotesPage({ params }: { params: Promise<{ videoId: string }> }) {
  const session = await requireSession();
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) notFound();
  const ws = await getWorkspace(session.user.id, videoId);
  if (!ws) notFound();
  if (ws.lock.holder !== "this" && ws.observation?.status !== "submitted") redirect(`/s/videos/${videoId}`);
  const note = ws.notes[0] ?? null;
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
        <Link href={`/s/videos/${videoId}`} className="rounded-sm text-lake underline underline-offset-4">
          {ws.video.displayCode}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-graphite">Notes</span>
      </nav>
      <NotesEditor videoId={videoId} initialNote={note ? { id: note.id, body: note.body } : null} />
    </div>
  );
}
