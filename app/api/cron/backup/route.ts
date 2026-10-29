/**
 * GET /api/cron/backup — the nightly copy into the Harvard Drive
 * (Amendment §58). Called by Vercel Cron (vercel.json), which sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
import { NextResponse } from "next/server";
import { runNightlyBackup } from "@/lib/db/admin-narratives";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await runNightlyBackup({
    actorId: null,
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    folderId: process.env.DRIVE_BACKUP_FOLDER_ID,
  });
  return r.ok
    ? NextResponse.json({ ok: true, files: r.files.map((f) => ({ name: f.name, bytes: f.bytes })) })
    : NextResponse.json({ ok: false, error: r.error }, { status: 500 });
}
