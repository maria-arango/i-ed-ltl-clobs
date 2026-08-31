/**
 * The calibration room for one video. Server wrapper: session, rubric
 * concept names, initial room state (through the restricted layer, which
 * holds the co-presence gate). The client component does the live part.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth-helpers";
import { getRubricContent } from "@/lib/db/coder";
import { CoderError } from "@/lib/db/coder";
import { getCalibrationRoom } from "@/lib/db/coder-calibration";
import { CalibrationRoom } from "@/components/calibration/calibration-room";

export default async function CalibrationRoomPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const session = await requireSession();
  const { videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) notFound();

  let initial;
  try {
    initial = await getCalibrationRoom(session.user.id, videoId);
  } catch (e) {
    if (e instanceof CoderError && e.status === 404) notFound();
    throw e;
  }

  const rubric = await getRubricContent();
  const conceptNames: Record<number, string> = {};
  for (const c of rubric?.concepts ?? []) conceptNames[c.itemNo] = c.name;

  return (
      <div className="space-y-6">
        <nav aria-label="Breadcrumb" className="text-[14px] text-smoke">
          <Link href="/" className="rounded-sm text-lake underline underline-offset-4">
            Home
          </Link>
          <span aria-hidden> / </span>
          <Link
            href="/calibration"
            className="rounded-sm text-lake underline underline-offset-4"
          >
            Calibration
          </Link>
          <span aria-hidden> / </span>
          <span className="video-code text-graphite">{initial.displayCode}</span>
        </nav>

        <CalibrationRoom
          videoId={videoId}
          conceptNames={conceptNames}
          initial={JSON.parse(JSON.stringify(initial))}
          myName={session.user.name ?? session.user.email ?? "You"}
        />
      </div>
  );
}
