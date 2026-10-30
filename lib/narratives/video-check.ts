/**
 * Does this video belong to this narrative? (Amendment §61)
 *
 * Video files are named "<sid>_<tr_id>_<grade>_<stream>_<SUBJECT>_comp.mp4"
 * (addendum Amendment B §6), and every narrative names its own lesson (the
 * tr_id) in its first line. So a video matches a narrative when its file
 * name starts with "<sid>_<tr_id>_". Repeated underscores are ignored: one
 * real file is named "<sid>__<tr_id>_…" by mistake.
 *
 * The name is taken from Google Drive for the linked file when the platform
 * can ask (the same service account as the nightly copy), and otherwise from
 * the assignment sheet's video_file column.
 */

export type DriveLookup = (fileId: string) => Promise<{ name: string } | { error: string }>;

export type VideoCheckMethod = "drive" | "sheet";

export type VideoCheckResult =
  | { ok: true; method: VideoCheckMethod; fileName: string }
  | { ok: true; method: null; fileName: string | null; note: string }
  | { ok: false; problem: string };

export function sidOf(lessonId: string): string {
  return lessonId.split("_")[0];
}

export function expectedPrefix(lessonId: string): string {
  return `${sidOf(lessonId)}_${lessonId}_`;
}

const collapse = (s: string) => s.trim().replace(/_+/g, "_");

export function videoNameMatches(fileName: string, lessonId: string): boolean {
  return collapse(fileName).startsWith(collapse(expectedPrefix(lessonId)));
}

/** The Drive file id in a Drive link (or a bare id), else null. */
export function driveFileId(link: string): string | null {
  const v = link.trim();
  if (/^[A-Za-z0-9_-]{20,}$/.test(v)) return v;
  try {
    const u = new URL(v);
    if (!/(^|\.)google\.com$/.test(u.hostname)) return null;
    const m = /\/file\/d\/([A-Za-z0-9_-]{20,})/.exec(u.pathname);
    if (m) return m[1];
    const id = u.searchParams.get("id");
    return id && /^[A-Za-z0-9_-]{20,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function checkVideo(input: {
  lessonId: string | null;
  videoUrl: string | null;
  sheetFile: string | null;
  lookup: DriveLookup | null;
}): Promise<VideoCheckResult> {
  const { lessonId, videoUrl } = input;
  const sheetFile = input.sheetFile?.trim() || null;
  if (!lessonId) return { ok: true, method: null, fileName: sheetFile, note: "not checked: this narrative has no lesson id" };
  if (sheetFile && !videoNameMatches(sheetFile, lessonId)) {
    return { ok: false, problem: `video_file "${sheetFile}" is not lesson ${lessonId} (it should start with ${expectedPrefix(lessonId)})` };
  }
  if (!videoUrl) {
    return { ok: true, method: null, fileName: sheetFile, note: "no video link yet" };
  }
  const id = driveFileId(videoUrl);
  let driveNote = "the link is not a Google Drive file";
  if (id && input.lookup) {
    const r = await input.lookup(id);
    if ("name" in r) {
      if (!videoNameMatches(r.name, lessonId)) {
        return { ok: false, problem: `the linked Drive file is "${r.name}", which is not lesson ${lessonId}` };
      }
      return { ok: true, method: "drive", fileName: r.name };
    }
    driveNote = r.error;
  } else if (id) {
    driveNote = "the Drive check is not set up";
  }
  if (sheetFile) return { ok: true, method: "sheet", fileName: sheetFile };
  return { ok: true, method: null, fileName: null, note: `not checked: ${driveNote}, and there is no video_file` };
}
