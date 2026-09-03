/**
 * EXPORT CONTRACT TESTS (CLAUDE.md testing floor: column names, types, row
 * counts, and the codebook).
 *
 * Fixture: one fully worked video in dataset='test' — two submitted and
 * locked observations (anchor + enumerator), a submitted and confirmed
 * context card with two adults, a rich-text note, a completed calibration
 * with eight consensus items and both signatures, an assignment with its
 * log rows, and timed events. What must hold:
 *
 *  - every table's rows carry EXACTLY the contract's columns, in the
 *    contract's order (CSV header) — nothing extra, nothing missing;
 *  - the derived columns (minutes_on_item, body_text, n_adults, wide
 *    pivot) come out as the codebook formulas say;
 *  - the Stata file parses back with the contract's names, labels, value
 *    labels and types; the CSV escapes correctly; the ZIP is well-formed;
 *  - the dataset rule: a live build never contains the test fixture, and
 *    the store step refuses non-live rows;
 *  - createExport writes the files and the codebook and re-serves them
 *    byte-for-byte.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentLog,
  assignmentRaters,
  assignments,
  auditLog,
  calibrationItems,
  calibrationSessions,
  calibrationSignoffs,
  contextAdults,
  contextCards,
  events,
  exportFiles,
  exports as exportsTable,
  notes,
  observations,
  pairMembers,
  pairs,
  rubricVersions,
  scores,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";
import {
  assertLiveOnly,
  buildExportTables,
  createExport,
  getExportBundle,
  getExportFile,
  htmlToText,
  minutesOnItems,
} from "@/lib/db/admin-exports";
import {
  CALIBRATION,
  CONTEXT_CARDS,
  EXPORT_TABLES,
  SCORES_LONG,
  SCORES_WIDE,
  SCORE_VALUE_LABELS,
  validateContract,
  type ExportRow,
  type ExportTable,
} from "@/lib/export/contract";
import { toCsv } from "@/lib/export/csv";
import { readDtaSummary, toDta } from "@/lib/export/dta";
import { crc32, toZip } from "@/lib/export/zip";
import { buildCodebookJson, buildCodebookMarkdown } from "@/lib/export/codebook";
import { purgeFixture } from "./fixtures";

const CODE = "V-TEST-EXP-1";
const FIXTURE = {
  displayCodes: [CODE],
  emails: ["exporttest-anchor@example.org", "exporttest-enum@example.org"],
  pairLabels: ["exporttest-pair"],
};

const ANCHOR = [1, 2, 3, 4, 1, 2, 3, 4];
const ENUM = [1, 3, 3, 2, 1, 2, 3, 4];
const FINAL = [1, 2, 3, 3, 1, 2, 3, 4]; // item 2: enum moved; item 4: both moved
const SENTINEL = 'EXPORT-SENTINEL, with "quotes"\nand a newline';

const TRIPLE: Record<number, { c: "A" | "B"; d: "somewhat" | "very" }> = {
  1: { c: "A", d: "very" },
  2: { c: "A", d: "somewhat" },
  3: { c: "B", d: "somewhat" },
  4: { c: "B", d: "very" },
};

let anchorId = "";
let enumId = "";
let videoId = "";
let pairId = "";
let createdExportId: string | null = null;

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const [anchor] = await db
    .insert(users)
    .values({ email: FIXTURE.emails[0], name: "Export Anchor", role: "admin" })
    .returning({ id: users.id });
  anchorId = anchor.id;
  const [en] = await db
    .insert(users)
    .values({ email: FIXTURE.emails[1], name: "Export Enumerator", role: "coder" })
    .returning({ id: users.id });
  enumId = en.id;

  const [pair] = await db
    .insert(pairs)
    .values({
      label: "exporttest-pair",
      dataset: "test",
      dissolvedAt: new Date(),
      dissolvedReason: "export test fixture (hidden from the Assignment screen)",
    })
    .returning({ id: pairs.id });
  pairId = pair.id;
  await db.insert(pairMembers).values([
    { pairId, userId: anchorId },
    { pairId, userId: enumId },
  ]);

  const [v] = await db
    .insert(videos)
    .values({ displayCode: CODE, dataset: "test", status: "complete", driveUrl: "https://drive.google.com/file/d/X/view" })
    .returning({ id: videos.id });
  videoId = v.id;
  await db.insert(videoProvenance).values({
    videoId,
    rawFilename: "99001_99001_7_11_EAST_PHYSICS_comp.mp4",
    sid: "99001",
    trId: "99001_7",
    arm: "dispersed",
    teacherAssignment: "treated",
    subject: "PHYSICS",
    recordedYear: 2026,
    importBatch: "export-test",
  });

  const [assn] = await db
    .insert(assignments)
    .values({
      videoId,
      pairId,
      waveNo: 1,
      dataset: "test",
      priorityBatchFlag: true,
      batchLabel: "recode-2026",
      status: "completed",
      // No assignedBy: wave numbering counts stamped rows, and the wave
      // suite runs in parallel on dataset 'test'.
    })
    .returning({ id: assignments.id });
  const [anchorRater] = await db
    .insert(assignmentRaters)
    .values({ assignmentId: assn.id, userId: anchorId, fillsContextCard: true, previouslyCoded: true })
    .returning({ id: assignmentRaters.id });
  const [enumRater] = await db
    .insert(assignmentRaters)
    .values({ assignmentId: assn.id, userId: enumId, fillsContextCard: false })
    .returning({ id: assignmentRaters.id });
  await db.insert(assignmentLog).values([
    { action: "assign", videoId, toPairId: pairId, toUserId: anchorId, fillsContextCard: true, seed: "export-seed", algorithmVersion: "wave-v1", waveNo: 1, actorId: anchorId, dataset: "test" },
    { action: "assign", videoId, toPairId: pairId, toUserId: enumId, fillsContextCard: false, seed: "export-seed", algorithmVersion: "wave-v1", waveNo: 1, actorId: anchorId, dataset: "test" },
  ]);

  const [rubric] = await db
    .select({ id: rubricVersions.id })
    .from(rubricVersions)
    .orderBy(sql`${rubricVersions.effectiveFrom} DESC NULLS LAST`)
    .limit(1);

  const t0 = new Date("2026-09-02T09:00:00Z");
  const at = (min: number) => new Date(t0.getTime() + min * 60000);

  const mkObs = async (coderId: string, raterId: string, values: number[], nSessions: number) => {
    const [obs] = await db
      .insert(observations)
      .values({
        videoId,
        coderId,
        assignmentRaterId: raterId,
        dataset: "test",
        status: "submitted",
        startedAt: t0,
        submittedAt: at(6),
        nSessions,
        rubricVersionId: rubric.id,
      })
      .returning({ id: observations.id });
    const ids: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const n = values[i - 1];
      const [s] = await db
        .insert(scores)
        .values({
          observationId: obs.id,
          itemNo: i,
          scoreNum: n,
          scoreColumn: TRIPLE[n].c,
          scoreDegree: TRIPLE[n].d,
          justification: coderId === enumId && i === 1 ? SENTINEL : `Justification ${i}`,
          rubricVersionId: rubric.id,
          dataset: "test",
          submittedAt: at(6),
          lockedAt: at(6),
        })
        .returning({ id: scores.id });
      ids.push(s.id);
    }
    return { obsId: obs.id, scoreIds: ids };
  };
  const a = await mkObs(anchorId, anchorRater.id, ANCHOR, 2);
  const b = await mkObs(enumId, enumRater.id, ENUM, 1);

  // Events for the anchor: item 1 open for 3 min, item 2 for 1 min.
  await db.insert(events).values([
    { userId: anchorId, dataset: "test", videoId, observationId: a.obsId, kind: "observation_started", occurredAt: at(0) },
    { userId: anchorId, dataset: "test", videoId, observationId: a.obsId, kind: "score_selected", payload: { itemNo: 1 }, occurredAt: at(2) },
    { userId: anchorId, dataset: "test", videoId, observationId: a.obsId, kind: "score_selected", payload: { itemNo: 2 }, occurredAt: at(5) },
    { userId: anchorId, dataset: "test", videoId, observationId: a.obsId, kind: "observation_submitted", occurredAt: at(6) },
  ]);

  await db.insert(notes).values({
    observationId: b.obsId,
    body: "<p>Hello &amp; <strong>world</strong></p><p>Line 2</p>",
    dataset: "test",
  });

  const [card] = await db
    .insert(contextCards)
    .values({
      videoId,
      authoredBy: anchorId,
      dataset: "test",
      status: "submitted",
      submittedAt: at(1),
      subject: "Physics",
      composition: "mixed",
      approxCount: "40-45",
      uniforms: "Blue shirts",
      room: "Brick classroom",
      camera: "Back corner",
      timeline: "Lecture then group work",
      confirmedBy: enumId,
      confirmedAt: at(7),
    })
    .returning({ id: contextCards.id });
  await db.insert(contextAdults).values([
    { contextCardId: card.id, adultNo: 1, role: "teacher", sex: "female", clothing: "Green dress", speaks: "yes", behavior: "Moves between desks" },
    { contextCardId: card.id, adultNo: 2, role: "camera_operator", sex: "male", speaks: "no" },
  ]);

  const [sess] = await db
    .insert(calibrationSessions)
    .values({ videoId, pairId, dataset: "test", status: "open", rubricVersionId: rubric.id })
    .returning({ id: calibrationSessions.id });
  for (let i = 1; i <= 8; i++) {
    const f = FINAL[i - 1];
    const resolution =
      ANCHOR[i - 1] === f && ENUM[i - 1] === f
        ? "agreed"
        : ANCHOR[i - 1] === f
          ? "b_moved"
          : ENUM[i - 1] === f
            ? "a_moved"
            : "both_moved";
    await db.insert(calibrationItems).values({
      sessionId: sess.id,
      itemNo: i,
      coderAScoreId: a.scoreIds[i - 1],
      coderBScoreId: b.scoreIds[i - 1],
      finalScoreNum: f,
      finalScoreColumn: TRIPLE[f].c,
      finalScoreDegree: TRIPLE[f].d,
      resolution,
      consensusRationale: resolution === "agreed" ? null : `We settled on ${f} for item ${i}.`,
      dataset: "test",
    });
  }
  await db.insert(calibrationSignoffs).values([
    { sessionId: sess.id, userId: anchorId, signedAt: at(30) },
    { sessionId: sess.id, userId: enumId, signedAt: at(31) },
  ]);
  await db
    .update(calibrationSessions)
    .set({ status: "completed", completedAt: at(31) })
    .where(eq(calibrationSessions.id, sess.id));
});

afterAll(async () => {
  if (createdExportId) {
    await db.delete(exportFiles).where(eq(exportFiles.exportId, createdExportId));
    await db.delete(auditLog).where(and(eq(auditLog.subjectTable, "exports"), eq(auditLog.subjectId, createdExportId)));
    await db.delete(exportsTable).where(eq(exportsTable.id, createdExportId));
  }
  // A completed test session's items are deletable only once the session
  // is no longer 'completed' (migration 0005): void it with a reason first.
  const sessions = await db
    .select({ id: calibrationSessions.id })
    .from(calibrationSessions)
    .where(eq(calibrationSessions.videoId, videoId));
  if (sessions.length) {
    await db
      .update(calibrationSessions)
      .set({ status: "voided", voidedReason: "export test cleanup" })
      .where(inArray(calibrationSessions.id, sessions.map((s) => s.id)));
  }
  await purgeFixture(FIXTURE);
});

/* --------------------------------- helpers --------------------------------- */

function rowsOf(built: Awaited<ReturnType<typeof buildExportTables>>, table: ExportTable): ExportRow[] {
  return built.rows[table.name];
}
const mine = (rows: ExportRow[]) => rows.filter((r) => r.display_code === CODE || r.video === CODE);

/* ---------------------------------- tests ---------------------------------- */

describe("the contract itself", () => {
  it("is well-formed (Stata-legal names, unique, labels within limits)", () => {
    expect(validateContract()).toEqual([]);
    expect(EXPORT_TABLES.map((t) => t.name)).toEqual([
      "clobs_scores_long",
      "clobs_scores_wide",
      "clobs_context_cards",
      "clobs_notes",
      "clobs_calibration",
      "clobs_assignments",
      "clobs_events",
      "clobs_videos",
      "clobs_coders",
    ]);
  });

  it("matches the pilot sheet's context-card layout: video first, then the general fields, A1_…A6_ blocks, timeline", () => {
    const names = CONTEXT_CARDS.columns.map((c) => c.name);
    expect(names.slice(0, 9)).toEqual([
      "video", "subject", "composition", "approx_count", "uniforms",
      "appearance_caveats", "room", "camera", "notes",
    ]);
    for (let n = 1; n <= 6; n++) {
      for (const f of ["role", "sex", "clothing", "clothing_caveats", "features", "behavior", "speaks"]) {
        expect(names).toContain(`A${n}_${f}`);
      }
    }
    expect(names.indexOf("A6_speaks")).toBeLessThan(names.indexOf("timeline"));
    expect(names).not.toContain("scene");
  });
});

describe("built tables", () => {
  let built: Awaited<ReturnType<typeof buildExportTables>>;
  beforeAll(async () => {
    built = await buildExportTables("test");
  });

  it("every row of every table carries exactly the contract's columns", () => {
    for (const t of EXPORT_TABLES) {
      const rows = rowsOf(built, t);
      expect(rows, t.name).toBeDefined();
      const expected = t.columns.map((c) => c.name).sort();
      for (const r of rows) {
        expect(Object.keys(r).sort(), `${t.name} row keys`).toEqual(expected);
      }
    }
  });

  it("scores_long: 16 individual + 8 consensus rows for the fixture video, with seats, minutes and flags", () => {
    const rows = mine(rowsOf(built, SCORES_LONG));
    expect(rows).toHaveLength(24);
    const individual = rows.filter((r) => r.rater_type === "individual");
    const consensus = rows.filter((r) => r.rater_type === "consensus");
    expect(individual).toHaveLength(16);
    expect(consensus).toHaveLength(8);

    const anchorItem1 = individual.find((r) => r.coder_id === anchorId && r.item_no === 1)!;
    expect(anchorItem1).toMatchObject({
      coder_pair_role: "anchor",
      pair_id: pairId,
      score_num: 1,
      score_column: "A",
      score_degree: "very",
      n_sessions: 2,
      minutes_on_item: 3,
      gold_flag: false,
      priority_batch_flag: true,
      batch_label: "recode-2026",
      previously_coded: true,
      rater_status: "active",
      sid: "99001",
      tr_id: "99001_7",
      arm: "dispersed",
      dataset: "test",
    });
    const anchorItem2 = individual.find((r) => r.coder_id === anchorId && r.item_no === 2)!;
    expect(anchorItem2.minutes_on_item).toBe(1);
    const anchorItem3 = individual.find((r) => r.coder_id === anchorId && r.item_no === 3)!;
    expect(anchorItem3.minutes_on_item).toBeNull();

    const enumItem1 = individual.find((r) => r.coder_id === enumId && r.item_no === 1)!;
    expect(enumItem1.coder_pair_role).toBe("enumerator");
    expect(enumItem1.justification).toBe(SENTINEL);
    expect(enumItem1.previously_coded).toBe(false);

    const c4 = consensus.find((r) => r.item_no === 4)!;
    expect(c4).toMatchObject({ coder_id: null, score_num: 3, resolution: "both_moved", observation_id: null });
    expect(c4.justification).toMatch(/settled on 3/);
    const c1 = consensus.find((r) => r.item_no === 1)!;
    expect(c1.resolution).toBe("agreed");
    // item_name comes from the rubric version (seeded in CI and locally)
    expect(typeof anchorItem1.item_name === "string" || anchorItem1.item_name === null).toBe(true);
  });

  it("scores_wide: one row per video with c/a/b pivots", () => {
    const rows = mine(rowsOf(built, SCORES_WIDE));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r).toMatchObject({
      pair_id: pairId,
      anchor_coder_id: anchorId,
      enumerator_coder_id: enumId,
      n_submitted: 2,
      calibrated: true,
      priority_batch_flag: true,
    });
    for (let i = 1; i <= 8; i++) {
      expect(r[`c${i}`], `c${i}`).toBe(FINAL[i - 1]);
      expect(r[`a${i}`], `a${i}`).toBe(ANCHOR[i - 1]);
      expect(r[`b${i}`], `b${i}`).toBe(ENUM[i - 1]);
    }
  });

  it("context_cards: single row with A1/A2 filled, A3–A6 empty, confirmation recorded", () => {
    const rows = mine(rowsOf(built, CONTEXT_CARDS));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r).toMatchObject({
      video: CODE,
      subject: "Physics",
      composition: "mixed",
      approx_count: "40-45",
      A1_role: "teacher",
      A1_sex: "female",
      A1_speaks: "yes",
      A1_behavior: "Moves between desks",
      A2_role: "camera_operator",
      A3_role: null,
      A6_speaks: null,
      n_adults: 2,
      card_status: "submitted",
      authored_by_coder_id: anchorId,
      confirmed_by_coder_id: enumId,
      flagged: false,
    });
  });

  it("notes: HTML kept and plain text derived", () => {
    const rows = mine(rowsOf(built, EXPORT_TABLES[3]));
    expect(rows).toHaveLength(1);
    expect(rows[0].coder_id).toBe(enumId);
    expect(rows[0].body_text).toBe("Hello & world\nLine 2");
    expect(rows[0].deleted).toBe(false);
  });

  it("calibration: eight rows with both individual scores, resolution and signatures", () => {
    const rows = mine(rowsOf(built, CALIBRATION));
    expect(rows).toHaveLength(8);
    const item2 = rows.find((r) => r.item_no === 2)!;
    expect(item2).toMatchObject({
      anchor_coder_id: anchorId,
      enumerator_coder_id: enumId,
      anchor_score_num: 2,
      enumerator_score_num: 3,
      final_score_num: 2,
      resolution: "b_moved",
      session_status: "completed",
    });
    expect(item2.anchor_signed_at).toBeInstanceOf(Date);
    expect(item2.enumerator_signed_at).toBeInstanceOf(Date);
  });

  it("assignments, events, videos, coders carry the fixture", () => {
    const assn = mine(rowsOf(built, EXPORT_TABLES[5]));
    expect(assn).toHaveLength(2);
    expect(assn[0]).toMatchObject({ action: "assign", seed: "export-seed", wave_no: 1, to_pair_id: pairId });
    expect(assn.find((r) => r.to_coder_id === anchorId)?.fills_context_card).toBe(true);

    const evts = mine(rowsOf(built, EXPORT_TABLES[6]));
    expect(evts.length).toBeGreaterThanOrEqual(4);
    expect(evts.find((e) => e.kind === "score_selected")?.payload_json).toBe('{"itemNo":1}');

    const vids = mine(rowsOf(built, EXPORT_TABLES[7]));
    expect(vids).toHaveLength(1);
    expect(vids[0]).toMatchObject({ raw_filename: "99001_99001_7_11_EAST_PHYSICS_comp.mp4", has_drive_link: true, excluded: false, status: "complete" });

    const coders = rowsOf(built, EXPORT_TABLES[8]);
    expect(coders.map((c) => c.coder_id)).toEqual(expect.arrayContaining([anchorId, enumId]));
    expect(coders.find((c) => c.coder_id === anchorId)).toMatchObject({ display_name: "Export Anchor", role: "admin" });
  });

  it("the dataset rule: a live build never contains the test fixture, and non-live rows are refused", async () => {
    const live = await buildExportTables();
    for (const t of EXPORT_TABLES) {
      const text = JSON.stringify(live.rows[t.name]);
      expect(text, t.name).not.toContain(CODE);
      expect(text, t.name).not.toContain("EXPORT-SENTINEL");
      for (const r of live.rows[t.name]) {
        if ("dataset" in r) expect(r.dataset).toBe("live");
      }
    }
    expect(() => assertLiveOnly(built.rows)).toThrow(/refused/);
    expect(() => assertLiveOnly(live.rows)).not.toThrow();
  });

  it("CSV: header is the contract, rows are escaped per RFC 4180", () => {
    const rows = mine(rowsOf(built, SCORES_LONG));
    const csv = toCsv(SCORES_LONG, rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(SCORES_LONG.columns.map((c) => c.name).join(","));
    // The sentinel has a comma, quotes and a newline → one quoted field.
    expect(csv).toContain('"EXPORT-SENTINEL, with ""quotes""\nand a newline"');
    // Booleans are 1/0; datetimes ISO.
    expect(csv).toMatch(/,1,/);
    expect(csv).toMatch(/2026-09-02T09:06:00\.000Z/);
    // Row count = rows + header (+ trailing CRLF).
    const dataLines = csv.replace(/"[^"]*"/g, (m) => m.replace(/\n/g, " ")).trim().split("\r\n");
    expect(dataLines).toHaveLength(rows.length + 1);
  });

  it("Stata: the .dta parses back with names, labels, value labels and types from the contract", () => {
    const rows = mine(rowsOf(built, SCORES_LONG));
    const bytes = toDta(SCORES_LONG, rows, { now: new Date("2026-09-03T00:00:00Z") });
    const s = readDtaSummary(bytes);
    expect(s.release).toBe(118);
    expect(s.K).toBe(SCORES_LONG.columns.length);
    expect(s.N).toBe(rows.length);
    expect(s.varnames).toEqual(SCORES_LONG.columns.map((c) => c.name));
    expect(s.variableLabels).toEqual(SCORES_LONG.columns.map((c) => c.label));
    const idx = (name: string) => s.varnames.indexOf(name);
    expect(s.types[idx("justification")]).toBe(32768); // strL
    expect(s.types[idx("item_no")]).toBe(65528); // long
    expect(s.types[idx("gold_flag")]).toBe(65530); // byte
    expect(s.types[idx("submitted_at")]).toBe(65526); // double
    expect(s.formats[idx("submitted_at")]).toBe("%tc");
    expect(s.valueLabelNames[idx("score_num")]).toBe("lb_score_num");
    expect(s.valueLabels["lb_score_num"]).toEqual(SCORE_VALUE_LABELS);
    expect(s.valueLabels["lb_arm"]).toEqual({ 1: "control", 2: "dispersed", 3: "connected" });
    expect(s.valueLabels["lb_gold_flag"]).toEqual({ 0: "no", 1: "yes" });
    // Empty table still writes a valid header.
    const empty = readDtaSummary(toDta(SCORES_WIDE, []));
    expect(empty.N).toBe(0);
    expect(empty.varnames).toEqual(SCORES_WIDE.columns.map((c) => c.name));
  });

  it("codebook: every table and column, row counts, formulas", () => {
    const rowCounts = Object.fromEntries(EXPORT_TABLES.map((t) => [t.name, built.rows[t.name].length]));
    const input = {
      exportId: "00000000-0000-0000-0000-000000000000",
      generatedAt: new Date("2026-09-03T00:00:00Z"),
      rubricVersion: built.rubricVersionLabel,
      items: built.items,
      rowCounts,
      requestedBy: "test",
      platformVersion: "test",
    };
    const json = buildCodebookJson(input);
    expect(json.tables.map((t) => t.name)).toEqual(EXPORT_TABLES.map((t) => t.name));
    for (const [i, t] of EXPORT_TABLES.entries()) {
      expect(json.tables[i].columns.map((c) => c.name)).toEqual(t.columns.map((c) => c.name));
      expect(json.tables[i].row_count).toBe(rowCounts[t.name]);
    }
    expect(json.score_encoding).toEqual(SCORE_VALUE_LABELS);
    expect(json.formulas.minutes_on_item).toMatch(/30 minutes/);
    const md = buildCodebookMarkdown(input);
    for (const t of EXPORT_TABLES) expect(md).toContain(`## ${t.name}`);
    expect(md).toContain("`minutes_on_item`");
  });
});

describe("pure helpers", () => {
  it("minutesOnItems attributes gaps to the earlier item and drops idle gaps", () => {
    const t = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, m));
    expect(
      minutesOnItems([
        { at: t(0), itemNo: null },
        { at: t(2), itemNo: 1 },
        { at: t(5), itemNo: 2 },
        { at: t(50), itemNo: 3 }, // 45 min after item 2 → idle, dropped
        { at: t(51), itemNo: null },
      ]),
    ).toEqual({ 1: 3, 3: 1 });
  });

  it("htmlToText strips tags, keeps paragraphs, decodes entities", () => {
    expect(htmlToText("<h2>Title</h2><ul><li>one</li><li>two &lt; three</li></ul>")).toBe(
      "Title\n• one\n• two < three",
    );
  });

  it("zip: CRC-32 reference value and a well-formed archive", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
    const z = toZip([
      { name: "a.txt", data: new TextEncoder().encode("hello") },
      { name: "b.csv", data: new TextEncoder().encode("x,y\r\n1,2\r\n") },
    ]);
    expect([...z.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const view = new DataView(z.buffer, z.byteOffset, z.byteLength);
    const eocd = z.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
  });
});

describe("createExport", () => {
  it("stores every file with a manifest and re-serves them unchanged", async () => {
    const created = await createExport(anchorId);
    createdExportId = created.exportId;
    const expectedFiles = [
      ...EXPORT_TABLES.flatMap((t) => [`${t.name}.csv`, `${t.name}.dta`]),
      "codebook.json",
      "codebook.md",
      "manifest.json",
    ].sort();
    expect(created.files.map((f) => f.filename).sort()).toEqual(expectedFiles);
    expect(Object.keys(created.rowCounts).sort()).toEqual(EXPORT_TABLES.map((t) => t.name).sort());

    const manifest = await getExportFile(anchorId, created.exportId, "manifest.json");
    expect(manifest?.contentType).toBe("application/json");
    const parsed = JSON.parse(manifest!.bytes.toString("utf8"));
    expect(parsed.export_id).toBe(created.exportId);
    expect(parsed.row_counts).toEqual(created.rowCounts);

    // The stored .dta has the live row count in its header.
    const dta = await getExportFile(anchorId, created.exportId, "clobs_scores_long.dta");
    const summary = readDtaSummary(new Uint8Array(dta!.bytes));
    expect(summary.N).toBe(created.rowCounts["clobs_scores_long"]);
    expect(summary.varnames).toEqual(SCORES_LONG.columns.map((c) => c.name));

    // The live export never carries the test fixture.
    const csv = await getExportFile(anchorId, created.exportId, "clobs_scores_long.csv");
    expect(csv!.bytes.toString("utf8")).not.toContain(CODE);

    // Bundle contains every file; downloads are audited.
    const bundle = await getExportBundle(anchorId, created.exportId);
    expect(bundle?.filename).toMatch(/^clobs-export-.*\.zip$/);
    expect(bundle!.bytes.length).toBeGreaterThan(1000);
    const audits = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.subjectTable, "exports"), eq(auditLog.subjectId, created.exportId)));
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(["export_created", "export_downloaded"]),
    );

    expect(await getExportFile(anchorId, created.exportId, "nope.csv")).toBeNull();
  });
});
