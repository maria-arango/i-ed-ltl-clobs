/**
 * Video library (ADMIN-ONLY): attach the real Drive links to imported
 * sessions by matching combined-file names on the `{sid}_{tr_id}_` prefix
 * (Amendment B §14). Preview → confirm, like every other bulk write.
 * Raw filenames appear on this admin surface only; nothing here is
 * reachable by the restricted coder role.
 */
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, videoProvenance, videos } from "@/db/schema";

export interface VideoLinkStats {
  codable: number;
  withLink: number;
  withoutLink: number;
}

export async function getVideoLinkStats(): Promise<VideoLinkStats> {
  const [row] = await db
    .select({
      codable: sql<number>`count(*)`,
      withLink: sql<number>`count(*) FILTER (WHERE ${videos.driveUrl} IS NOT NULL AND ${videos.driveUrl} <> '')`,
    })
    .from(videos)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .where(and(eq(videos.dataset, "live"), eq(videoProvenance.excluded, false)));
  const codable = Number(row.codable);
  const withLink = Number(row.withLink);
  return { codable, withLink, withoutLink: codable - withLink };
}

export async function listVideosMissingLinks(limit = 25) {
  return db
    .select({
      videoId: videos.id,
      displayCode: videos.displayCode,
      rawFilename: videoProvenance.rawFilename,
    })
    .from(videos)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .where(
      and(
        eq(videos.dataset, "live"),
        eq(videoProvenance.excluded, false),
        or(isNull(videos.driveUrl), eq(videos.driveUrl, "")),
      ),
    )
    .orderBy(asc(videos.displayCode))
    .limit(limit);
}

/* ------------------------------ matching ----------------------------- */

export interface ParsedLine {
  filename: string;
  url: string;
}

export interface DriveLinkPreview {
  matched: Array<{
    videoId: string;
    displayCode: string;
    filename: string;
    url: string;
    replacesExisting: boolean;
  }>;
  ambiguous: Array<{
    filename: string;
    url: string;
    candidates: Array<{ videoId: string; displayCode: string; rawFilename: string }>;
  }>;
  unmatched: string[];
  invalidLines: string[];
}

/** One line = one file: a Drive URL plus the file's name, any order,
 *  separated by whitespace, a comma or a tab. */
export function parseDriveLines(text: string): {
  entries: ParsedLine[];
  invalid: string[];
} {
  const entries: ParsedLine[] = [];
  const invalid: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const urlMatch = line.match(/https?:\/\/\S+/);
    if (!urlMatch) {
      invalid.push(line);
      continue;
    }
    const url = urlMatch[0].replace(/[),.;]+$/, "");
    const rest = line.replace(urlMatch[0], " ").replace(/[,\t]/g, " ").trim();
    const filename = rest.split(/\s+/).filter(Boolean).join(" ");
    if (!filename) {
      invalid.push(line);
      continue;
    }
    entries.push({ filename, url });
  }
  return { entries, invalid };
}

function stripExtension(name: string): string {
  return name.replace(/\.(mp4|mov|mkv|avi|webm)$/i, "");
}

export async function previewDriveLinks(text: string): Promise<DriveLinkPreview> {
  const { entries, invalid } = parseDriveLines(text);
  const provenance = await db
    .select({
      videoId: videoProvenance.videoId,
      rawFilename: videoProvenance.rawFilename,
      sid: videoProvenance.sid,
      trId: videoProvenance.trId,
      displayCode: videos.displayCode,
      driveUrl: videos.driveUrl,
    })
    .from(videoProvenance)
    .innerJoin(videos, eq(videos.id, videoProvenance.videoId))
    .where(and(eq(videos.dataset, "live"), eq(videoProvenance.excluded, false)));

  const matched: DriveLinkPreview["matched"] = [];
  const ambiguous: DriveLinkPreview["ambiguous"] = [];
  const unmatched: string[] = [];

  for (const entry of entries) {
    const base = stripExtension(entry.filename);
    // 1) exact raw-filename match (handles the ~2 duplicate sessions);
    // 2) otherwise unique `{sid}_{tr_id}_` prefix match.
    let candidates = provenance.filter(
      (p) => stripExtension(p.rawFilename) === base,
    );
    if (candidates.length === 0) {
      candidates = provenance.filter((p) =>
        base.startsWith(`${p.sid}_${p.trId}_`) || base === `${p.sid}_${p.trId}`,
      );
    }
    if (candidates.length === 1) {
      const c = candidates[0];
      matched.push({
        videoId: c.videoId,
        displayCode: c.displayCode,
        filename: entry.filename,
        url: entry.url,
        replacesExisting: c.driveUrl !== null && c.driveUrl !== "",
      });
    } else if (candidates.length > 1) {
      ambiguous.push({
        filename: entry.filename,
        url: entry.url,
        candidates: candidates.map((c) => ({
          videoId: c.videoId,
          displayCode: c.displayCode,
          rawFilename: c.rawFilename,
        })),
      });
    } else {
      unmatched.push(entry.filename);
    }
  }
  return { matched, ambiguous, unmatched, invalidLines: invalid };
}

/* ------------------------------- writes ------------------------------ */

export async function confirmDriveLinks(
  actorId: string,
  links: Array<{ videoId: string; url: string }>,
): Promise<{ ok: true; attached: number } | { ok: false; error: string }> {
  if (links.length === 0) return { ok: false, error: "Nothing to attach." };
  for (const l of links) {
    if (!/^https:\/\/(drive|docs)\.google\.com\//.test(l.url)) {
      return {
        ok: false,
        error: "Every link must be a Google Drive URL (https://drive.google.com/…).",
      };
    }
  }
  await db.transaction(async (tx) => {
    for (const l of links) {
      await tx.update(videos).set({ driveUrl: l.url }).where(eq(videos.id, l.videoId));
    }
    await tx.insert(auditLog).values({
      actorId,
      action: "drive_links_attached",
      subjectTable: "videos",
      details: { count: links.length },
    });
  });
  return { ok: true, attached: links.length };
}

/** Attach one link by display code (for the duplicate-session videos). */
export async function attachSingleLink(
  actorId: string,
  displayCode: string,
  url: string,
): Promise<{ ok: true; displayCode: string } | { ok: false; error: string }> {
  const code = displayCode.trim().toUpperCase();
  const [video] = await db
    .select({ id: videos.id, displayCode: videos.displayCode })
    .from(videos)
    .where(eq(videos.displayCode, code));
  if (!video) return { ok: false, error: `No video with code ${code}.` };
  const result = await confirmDriveLinks(actorId, [{ videoId: video.id, url: url.trim() }]);
  if (!result.ok) return result;
  return { ok: true, displayCode: video.displayCode };
}
