/**
 * REVIEW SCRIPTS, VIDEO CHECKS, PRACTICE — Amendment §61.
 *
 *  - A review script Word file (review_script.py's shape) is read with
 *    every paragraph's text kept exactly, and the lesson id from its title.
 *  - Its Word download keeps that shape: title and subtitle first, lines as
 *    "time ⇥ who ⇥ text" with real tabs, red and strikethrough as Word
 *    formatting — what the team's review_import.py reads back.
 *  - A video belongs to a narrative when its file name starts with
 *    "<sid>_<tr_id>_" (repeated underscores ignored); a sheet row whose
 *    video belongs to another lesson cannot be assigned.
 *  - Enumerators see "Video <order>"; practice narratives are "Practice",
 *    listed first, and kept out of the real progress.
 *
 * The script here is invented (lesson 99991_5); no real data.
 */
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { narrativeAssignments, narratives, userTeams, users } from "@/db/schema";
import {
  assignNarrative,
  confirmAssignmentSheet,
  confirmNarrativeImport,
  getNarrativeDashboard,
  previewAssignmentSheet,
  previewNarrativeImport,
} from "@/lib/db/admin-narratives";
import { listMyNarratives } from "@/lib/db/narratives";
import { narrativeToDocx } from "@/lib/narratives/docx";
import type { PMNode } from "@/lib/narratives/doc";
import { validateNarrativeDoc } from "@/lib/narratives/editor-schema";
import { paragraphsFromDocumentXml, parseReviewScript, scriptToDoc } from "@/lib/narratives/script";
import { scriptLayout, segmentRoles } from "@/lib/narratives/script-layout";
import { checkVideo, driveFileId, type DriveLookup, videoNameMatches } from "@/lib/narratives/video-check";
import { purgeFixture } from "./fixtures";

/* ---- an invented script, written the way python-docx writes one ---- */

interface R {
  t: string;
  b?: boolean;
  i?: boolean;
  grey?: boolean;
  sz?: number;
  mono?: boolean;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function para(runs: R[], ind?: { left: number; hanging?: number }): string {
  const ppr = ind ? `<w:pPr><w:ind w:left="${ind.left}"${ind.hanging ? ` w:hanging="${ind.hanging}"` : ""}/></w:pPr>` : "";
  const body = runs
    .map((r) => {
      const rpr = [
        r.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : "",
        r.b ? "<w:b/>" : "",
        r.i ? "<w:i/>" : "",
        r.grey ? '<w:color w:val="808080"/>' : "",
        r.sz ? `<w:sz w:val="${r.sz}"/>` : "",
      ].join("");
      const content = r.t
        .split("\t")
        .map((piece) => (piece ? `<w:t xml:space="preserve">${esc(piece)}</w:t>` : ""))
        .join("<w:tab/>");
      return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}${content}</w:r>`;
    })
    .join("");
  return `<w:p>${ppr}${body}</w:p>`;
}

const LINE = { left: 2477, hanging: 2477 };
const FACT = { left: 1656, hanging: 1656 };
const line = (time: string, who: string, text: string, kind: "spoken" | "seen" | "scene" = "spoken") =>
  para(
    [
      { t: `${time}\t${who}\t`, mono: true, sz: 20, grey: kind === "seen", b: kind === "scene" },
      { t: text, sz: 21, grey: kind === "seen", i: kind === "seen", b: kind === "scene" },
    ],
    LINE,
  );

const LESSON = "99991_5";
const SCRIPT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${[
  para([{ t: `Review script — ${LESSON}`, b: true, sz: 32 }]),
  para([{ t: "original (v17-v21) narrative  ·  4 lines  ·  with scene lines  ·  lesson runs 12:34", i: true, grey: true, sz: 18 }]),
  para([{ t: "Read this against the video, all the way through.", sz: 19 }]),
  para([{ t: "What the context card says", b: true, sz: 22 }]),
  para([{ t: "A person wrote these from the video.", i: true, sz: 18 }]),
  para([{ t: "Subject\t", b: true, mono: true, sz: 19 }, { t: "Biology", sz: 19 }], FACT),
  para([{ t: "Who is in the room", b: true, sz: 20 }]),
  para([{ t: "A1\t", b: true, mono: true, sz: 19 }, { t: "teacher. green shirt & tie.", sz: 19 }], FACT),
  para([{ t: "The lesson", b: true, sz: 22 }]),
  para([{ t: "00:00  " + "—".repeat(46), b: true, grey: true, sz: 16 }]),
  line("00:00", "(scene)", "The teacher greets the class.", "scene"),
  line("00:02", "(seen)", "A1 stands by the board.", "seen"),
  line("00:05", "A1", "Good morning, class."),
  para([{ t: "?  first heard as «Good morning»", i: true, grey: true, sz: 17 }], { left: 2477 }),
  line("00:09", "all together", "Good morning, teacher."),
].join("")}</w:body></w:document>`;

async function scriptDocx(xml = SCRIPT_XML): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "uint8array" });
}

async function documentXml(bytes: Uint8Array | Buffer): Promise<string> {
  return (await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string")) as string;
}

/* ------------------------------------------------------------------ */

describe("reading a review script", () => {
  it("names every paragraph and keeps its text exactly", async () => {
    const p = await parseReviewScript(await scriptDocx());
    expect(p.lessonId).toBe(LESSON);
    expect(p.duration).toBe("12:34");
    expect(p.lineCount).toBe(4);
    expect(p.warnings).toEqual([]);
    expect(p.blocks.map((b) => b.kind)).toEqual([
      "title", "subtitle", "plain", "h2", "note", "fact", "h3", "fact", "h2", "rule", "line", "line", "line", "flag", "line",
    ]);
    expect(p.blocks[7].text).toBe("A1\tteacher. green shirt & tie.");
    expect(p.blocks[12].text).toBe("00:05\tA1\tGood morning, class.");
    expect(validateNarrativeDoc(scriptToDoc(p)).ok).toBe(true);
  });

  it("refuses a file that is not a review script", async () => {
    const p = await parseReviewScript(new TextEncoder().encode("not a zip"));
    expect(p.lessonId).toBeNull();
    expect(p.warnings).toContain("Not a Word (.docx) file.");
    const xml = SCRIPT_XML.replace(`Review script — ${LESSON}`, "Some other document");
    const q = await parseReviewScript(await scriptDocx(xml));
    expect(q.lessonId).toBeNull();
  });

  it("reads tracked deletions as gone", () => {
    const xml = `<w:p><w:r><w:t>kept</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p>`;
    expect(paragraphsFromDocumentXml(xml)[0].text).toBe("kept");
  });
});

describe("the script layout", () => {
  it("puts time, speaker and text in columns", () => {
    const l = scriptLayout("00:05\tA1\tGood morning.", "line")!;
    expect(l.tabs).toEqual([
      { at: 5, width: 2 },
      { at: 8, width: 12 },
    ]);
    expect(l.kind).toBe("spoken");
    expect(scriptLayout("00:00\t(scene)\tx", "line")!.kind).toBe("scene");
    expect(scriptLayout("00:02\t(seen)\tx", "line")!.kind).toBe("seen");
    // a line the enumerator typed into a new (plain) paragraph is a line too
    expect(scriptLayout("05:12\tS1\tI know!", null)!.kind).toBe("spoken");
    expect(scriptLayout("Just a sentence.", null)).toBeNull();
    expect(scriptLayout("Subject\tBiology", "fact")!.tabs).toEqual([{ at: 7, width: 9 }]);
  });

  it("cuts a run at the column boundaries", () => {
    const l = scriptLayout("00:05\tA1\tGood", "line");
    expect(segmentRoles(l, 0, 13).map((s) => s.role)).toEqual(["pre", "tab", "pre", "tab", "body"]);
  });
});

describe("the Word download of a script", () => {
  it("keeps review_import.py's shape, with red and strikethrough as formatting", async () => {
    const parsed = await parseReviewScript(await scriptDocx());
    const doc = scriptToDoc(parsed);
    // The enumerator strikes "class." and adds "[smiling]" in red.
    const target = doc.content!.find((b) => b.content?.[0]?.text === "00:05\tA1\tGood morning, class.")!;
    target.content = [
      { type: "text", text: "00:05\tA1\tGood morning, " },
      { type: "text", text: "class.", marks: [{ type: "strike" }] },
      { type: "text", text: " [smiling]", marks: [{ type: "textColor", attrs: { color: "red" } }] },
    ];
    const bytes = await narrativeToDocx({
      template: null,
      label: LESSON,
      reviewerName: "Test Reviewer",
      durationLabel: "12:34",
      doc: doc as PMNode,
      answers: {},
      comments: [],
      activeMinutes: 9,
      firstStart: null,
      lastEnd: null,
      submittedAt: null,
    });
    const xml = await documentXml(bytes);
    const out = paragraphsFromDocumentXml(xml).filter((p) => p.text.trim());
    expect(out[0].text).toBe(`Review script — ${LESSON}`);
    expect(out[1].text).toContain("narrative  ·  4 lines");
    expect(out[2].text).toMatch(/^Reviewed on the platform by Test Reviewer/);
    const texts = out.map((p) => p.text);
    for (const b of parsed.blocks) {
      if (b.kind === "line" && !b.text.startsWith("00:05")) expect(texts).toContain(b.text);
    }
    expect(texts).toContain("00:05\tA1\tGood morning, class. [smiling]");
    expect(xml).toContain("<w:tab/>");
    expect(xml).toMatch(/<w:strike\/>/);
    expect(xml).toContain('w:val="FF0000"');
    // no review-question template on a script
    expect(xml).not.toContain("Accuracy and errors");
  });
});

describe("matching a video to its narrative", () => {
  it("compares the file name with <sid>_<tr_id>_", () => {
    expect(videoNameMatches("99991_99991_5_11_EAST_BIOLOGY_comp.mp4", LESSON)).toBe(true);
    expect(videoNameMatches("99991__99991_5_11_EAST_BIOLOGY_comp.mp4", LESSON)).toBe(true); // known typo shape
    expect(videoNameMatches("99991_99991_50_11_EAST_BIOLOGY_comp.mp4", LESSON)).toBe(false);
    expect(videoNameMatches("99992_99992_5_11_EAST_BIOLOGY_comp.mp4", LESSON)).toBe(false);
  });

  it("finds the Drive file id in a link", () => {
    expect(driveFileId("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
    expect(driveFileId("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUv")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
    expect(driveFileId("1AbCdEfGhIjKlMnOpQrStUv")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
    expect(driveFileId("https://example.org/video.mp4")).toBeNull();
  });

  const link = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view";
  const named = (name: string): DriveLookup => async () => ({ name });
  const broken: DriveLookup = async () => ({ error: "Drive could not be reached" });

  it("trusts the name Drive reports, and refuses the wrong video", async () => {
    expect(await checkVideo({ lessonId: LESSON, videoUrl: link, sheetFile: null, lookup: named("99991_99991_5_x.mp4") })).toEqual({
      ok: true,
      method: "drive",
      fileName: "99991_99991_5_x.mp4",
    });
    const wrong = await checkVideo({ lessonId: LESSON, videoUrl: link, sheetFile: null, lookup: named("99992_99992_1_x.mp4") });
    expect(wrong.ok).toBe(false);
  });

  it("falls back to the sheet's video_file, and says when nothing could be checked", async () => {
    expect(await checkVideo({ lessonId: LESSON, videoUrl: link, sheetFile: "99991_99991_5_x.mp4", lookup: broken })).toMatchObject({
      ok: true,
      method: "sheet",
    });
    expect(await checkVideo({ lessonId: LESSON, videoUrl: link, sheetFile: null, lookup: null })).toMatchObject({ ok: true, method: null });
    expect((await checkVideo({ lessonId: LESSON, videoUrl: link, sheetFile: "99992_99992_1_x.mp4", lookup: null })).ok).toBe(false);
  });
});

/* ---- database: load, sheet, labels, practice ---- */

const FIXTURE = {
  displayCodes: [] as string[],
  emails: ["scripttest-admin@example.org", "scripttest-enum@example.org"],
  pairLabels: [] as string[],
};
const ids: Record<string, string> = {};
let narrativeId = "";
const GOOD_FILE = `99991_${LESSON}_11_EAST_BIOLOGY_comp.mp4`;
const DRIVE_ID = "1AbCdEfGhIjKlMnOpQrStUv";

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const [admin] = await db.insert(users).values({ email: FIXTURE.emails[0], role: "admin", datasetScope: "test" }).returning({ id: users.id });
  const [e] = await db.insert(users).values({ email: FIXTURE.emails[1], name: "Script Enumerator", role: "coder", datasetScope: "test" }).returning({ id: users.id });
  ids.admin = admin.id;
  ids.enum = e.id;
  await db.insert(userTeams).values({ userId: e.id, team: "narratives" });
  const dataBase64 = Buffer.from(await scriptDocx()).toString("base64");
  const preview = await previewNarrativeImport([{ name: "s.docx", dataBase64 }], "test");
  expect(preview[0]).toMatchObject({ format: "script", lessonId: LESSON, episodes: 4, importable: true });
  const r = await confirmNarrativeImport(admin.id, [{ name: "s.docx", dataBase64 }], { dataset: "test" });
  if (!r.ok) throw new Error(r.error);
  const [n] = await db.select().from(narratives).where(and(eq(narratives.importedBy, admin.id), eq(narratives.dataset, "test")));
  narrativeId = n.id;
});
afterAll(() => purgeFixture(FIXTURE));

describe("assigning scripts from a sheet", () => {
  const sheet = (file: string) =>
    `order,reviewer,video_id,video_file,video_drive_id\r\n1,${FIXTURE.emails[1]},${LESSON},${file},${DRIVE_ID}\r\n`;

  it("refuses a row whose video belongs to another lesson", async () => {
    const [byFile] = await previewAssignmentSheet(sheet("99992_99992_1_x.mp4"), null, "test");
    expect(byFile.problems.join(" ")).toMatch(/is not lesson 99991_5/);
    const [byDrive] = await previewAssignmentSheet(sheet(GOOD_FILE), async () => ({ name: "99992_99992_1_x.mp4" }), "test");
    expect(byDrive.problems.join(" ")).toMatch(/linked Drive file is "99992_99992_1_x.mp4"/);
  });

  it("assigns a matching row, recording the Drive name; no questions on a script", async () => {
    const lookup: DriveLookup = async (id) => (id === DRIVE_ID ? { name: `99991__${LESSON}_11_EAST_BIOLOGY_comp.mp4` } : { error: "?" });
    const [row] = await previewAssignmentSheet(sheet(GOOD_FILE), lookup, "test");
    expect(row).toMatchObject({ problems: [], lessonId: LESSON, sid: "99991", videoCheck: "drive" });
    const r = await confirmAssignmentSheet(ids.admin, sheet(GOOD_FILE), lookup, "test");
    expect(r).toMatchObject({ ok: true, assigned: 1 });
    const [a] = await db.select().from(narrativeAssignments).where(eq(narrativeAssignments.narrativeId, narrativeId));
    expect(a.videoCheck).toBe("drive");
    expect(a.videoFile).toBe(`99991__${LESSON}_11_EAST_BIOLOGY_comp.mp4`);
    expect(a.templateId).toBeNull();
    const dash = await getNarrativeDashboard("test");
    expect(dash.find((d) => d.narrativeId === narrativeId)).toMatchObject({ sid: "99991", format: "script", videoCheck: "drive" });
  });

  it("keeps 'Video <order>' unique per person", async () => {
    const other = Buffer.from(await scriptDocx(SCRIPT_XML.replace(`Review script \u2014 ${LESSON}`, "Review script \u2014 99991_6"))).toString("base64");
    const r = await confirmNarrativeImport(ids.admin, [{ name: "s6.docx", dataBase64: other }], { dataset: "test" });
    expect(r.ok && r.created.length).toBe(1);
    const [n6] = await db.select().from(narratives).where(and(eq(narratives.importedBy, ids.admin), eq(narratives.lessonId, "99991_6")));
    const clash = await assignNarrative(ids.admin, { narrativeId: n6.id, assigneeId: ids.enum, orderNo: 1, videoUrl: null }, null);
    expect(clash).toMatchObject({ ok: false });
    expect(!clash.ok && clash.error).toMatch(/already has a Video 1\. Use order 2/);
    const [row] = await previewAssignmentSheet(
      `order,reviewer,video_id\r\n1,${FIXTURE.emails[1]},99991_6\r\n`,
      null,
      "test",
    );
    expect(row.problems).toContain("this reviewer already has a Video 1");
    expect((await assignNarrative(ids.admin, { narrativeId: n6.id, assigneeId: ids.enum, orderNo: 2, videoUrl: null }, null)).ok).toBe(true);
  });

  it("shows enumerators 'Video <order>', with practice narratives first as 'Practice'", async () => {
    const dataBase64 = Buffer.from(await scriptDocx()).toString("base64");
    const r = await confirmNarrativeImport(ids.admin, [{ name: "s.docx", dataBase64 }], { dataset: "training" });
    expect(r.ok && r.created.length).toBe(1);
    const [practice] = await db
      .select()
      .from(narratives)
      .where(and(eq(narratives.importedBy, ids.admin), eq(narratives.dataset, "training")));
    const a = await assignNarrative(ids.admin, { narrativeId: practice.id, assigneeId: ids.enum, orderNo: 1, videoUrl: null }, null);
    expect(a.ok).toBe(true);
    const list = await listMyNarratives(ids.enum);
    expect(list.map((x) => x.label)).toEqual(["Practice", "Video 1", "Video 2"]);
    expect((await getNarrativeDashboard("test")).some((d) => d.narrativeId === practice.id)).toBe(false);
  });
});
