/**
 * EXPORTS (ADMIN-ONLY): build the tidy dataset set declared in
 * lib/export/contract.ts from the LIVE data, write CSV + Stata + codebook,
 * store every file verbatim (export_files) and record the export with its
 * row counts, rubric version and manifest. Past exports are re-served from
 * storage, never regenerated (docs/03-data-model.md §4.9).
 *
 * Blinding: this module unblinds by design (school, arm, teacher, raw
 * filename). It is reachable only from admin code paths and every download
 * is written to the audit log.
 *
 * Dataset rule (ADR 0001): every builder filters dataset = 'live' on its
 * primary table, and createExport refuses to store a row whose `dataset`
 * column is anything else. The contract test exercises both.
 */
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
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
  rubricConcepts,
  rubricVersions,
  scoreNoteCitations,
  scores,
  users,
  videoProvenance,
  videos,
} from "@/db/schema";
import {
  ASSIGNMENTS,
  CALIBRATION,
  CODERS,
  CONTEXT_CARDS,
  EVENTS,
  EXPORT_TABLES,
  NOTES,
  SCORES_LONG,
  SCORES_WIDE,
  VIDEOS,
  type ExportRow,
  type ExportTable,
} from "@/lib/export/contract";
import { toCsv } from "@/lib/export/csv";
import { toDta } from "@/lib/export/dta";
import { toZip } from "@/lib/export/zip";
import { buildCodebookJson, buildCodebookMarkdown } from "@/lib/export/codebook";

const LIVE = "live" as const;
const IDLE_GAP_MS = 30 * 60 * 1000;

/* ------------------------------ helpers ------------------------------ */

/** HTML → plain text (block tags to newlines, tags stripped, entities decoded). */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface VideoFacts {
  videoId: string;
  displayCode: string;
  sid: string;
  trId: string;
  arm: string | null;
  teacherAssignment: string | null;
  subject: string | null;
  isGold: boolean;
}

function videoCols(v: VideoFacts | undefined): ExportRow {
  return {
    video_id: v?.videoId ?? null,
    display_code: v?.displayCode ?? null,
    sid: v?.sid ?? null,
    tr_id: v?.trId ?? null,
    arm: v?.arm ?? null,
    teacher_assignment: v?.teacherAssignment ?? null,
    subject: v?.subject ?? null,
  };
}

/**
 * Minutes per item from the event log (formula in the codebook): each gap
 * between consecutive events of an observation is attributed to the item
 * of the earlier event; gaps > 30 min are idle and dropped.
 */
export function minutesOnItems(
  evts: Array<{ at: Date; itemNo: number | null }>,
): Record<number, number> {
  const sorted = [...evts].sort((a, b) => a.at.getTime() - b.at.getTime());
  const out: Record<number, number> = {};
  for (let i = 0; i < sorted.length - 1; i++) {
    const item = sorted[i].itemNo;
    if (item === null) continue;
    const gap = sorted[i + 1].at.getTime() - sorted[i].at.getTime();
    if (gap <= 0 || gap > IDLE_GAP_MS) continue;
    out[item] = (out[item] ?? 0) + gap / 60000;
  }
  for (const k of Object.keys(out)) out[Number(k)] = Math.round(out[Number(k)] * 100) / 100;
  return out;
}

/* ------------------------------ loaders ------------------------------ */

async function loadVideoFacts(dataset: Dataset): Promise<Map<string, VideoFacts>> {
  const rows = await db
    .select({
      videoId: videos.id,
      displayCode: videos.displayCode,
      isGold: videos.isGold,
      sid: videoProvenance.sid,
      trId: videoProvenance.trId,
      arm: videoProvenance.arm,
      teacherAssignment: videoProvenance.teacherAssignment,
      subject: videoProvenance.subject,
    })
    .from(videos)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .where(eq(videos.dataset, dataset));
  return new Map(rows.map((r) => [r.videoId, r]));
}

/** Anchor per pair: the admin / chief-coder seat (Amendment B §2). */
async function loadPairAnchors(): Promise<Map<string, string>> {
  const rows = await db
    .select({
      pairId: pairMembers.pairId,
      userId: pairMembers.userId,
      role: users.role,
      isChiefCoder: users.isChiefCoder,
    })
    .from(pairMembers)
    .innerJoin(users, eq(users.id, pairMembers.userId));
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.role === "admin" || r.isChiefCoder) {
      if (!out.has(r.pairId)) out.set(r.pairId, r.userId);
    }
  }
  return out;
}

async function loadRubric() {
  const versions = await db
    .select({ id: rubricVersions.id, label: rubricVersions.versionLabel, effectiveFrom: rubricVersions.effectiveFrom })
    .from(rubricVersions)
    .orderBy(sql`${rubricVersions.effectiveFrom} DESC NULLS LAST`);
  const labelById = new Map(versions.map((v) => [v.id, v.label]));
  const concepts = await db
    .select({ versionId: rubricConcepts.rubricVersionId, itemNo: rubricConcepts.itemNo, name: rubricConcepts.name })
    .from(rubricConcepts);
  const nameByVersionItem = new Map(concepts.map((c) => [`${c.versionId}#${c.itemNo}`, c.name]));
  const active = versions[0] ?? null;
  const activeItems: Record<number, string> = {};
  if (active) {
    for (const c of concepts) if (c.versionId === active.id) activeItems[c.itemNo] = c.name;
  }
  return {
    active,
    labelById,
    itemName: (versionId: string | null, itemNo: number) =>
      (versionId && nameByVersionItem.get(`${versionId}#${itemNo}`)) ?? activeItems[itemNo] ?? null,
    activeItems,
  };
}

/* --------------------------- table builders --------------------------- */

export interface BuiltTables {
  rows: Record<string, ExportRow[]>;
  rubricVersionId: string | null;
  rubricVersionLabel: string | null;
  items: Record<number, string>;
}

type Dataset = "live" | "test" | "training";

/**
 * Assemble every table. `dataset` defaults to live and is exposed ONLY so
 * the contract test can build from a purgeable test fixture; createExport
 * never passes it.
 */
export async function buildExportTables(dataset: Dataset = LIVE): Promise<BuiltTables> {
  const facts = await loadVideoFacts(dataset);
  const anchors = await loadPairAnchors();
  const rubric = await loadRubric();

  // --- assignments (non-voided) with their rater rows
  const assnRows = await db
    .select({
      id: assignments.id,
      videoId: assignments.videoId,
      pairId: assignments.pairId,
      status: assignments.status,
      priorityBatchFlag: assignments.priorityBatchFlag,
      batchLabel: assignments.batchLabel,
      assignedAt: assignments.assignedAt,
    })
    .from(assignments)
    .where(eq(assignments.dataset, dataset))
    .orderBy(asc(assignments.assignedAt));
  const assnById = new Map(assnRows.map((a) => [a.id, a]));
  // Latest live assignment per video, preferring active/completed.
  const assnByVideo = new Map<string, (typeof assnRows)[number]>();
  for (const a of assnRows) {
    const cur = assnByVideo.get(a.videoId);
    const rank = (s: string) => (s === "active" || s === "completed" ? 1 : 0);
    if (!cur || rank(a.status) >= rank(cur.status)) assnByVideo.set(a.videoId, a);
  }
  const raterRows = assnRows.length
    ? await db
        .select({
          id: assignmentRaters.id,
          assignmentId: assignmentRaters.assignmentId,
          userId: assignmentRaters.userId,
          fillsContextCard: assignmentRaters.fillsContextCard,
          previouslyCoded: assignmentRaters.previouslyCoded,
          status: assignmentRaters.status,
        })
        .from(assignmentRaters)
        .where(inArray(assignmentRaters.assignmentId, assnRows.map((a) => a.id)))
    : [];
  const raterById = new Map(raterRows.map((r) => [r.id, r]));
  const raterByAssnUser = new Map(raterRows.map((r) => [`${r.assignmentId}#${r.userId}`, r]));

  // --- observations + locked scores
  const obsRows = await db
    .select({
      id: observations.id,
      videoId: observations.videoId,
      coderId: observations.coderId,
      assignmentRaterId: observations.assignmentRaterId,
      status: observations.status,
      startedAt: observations.startedAt,
      submittedAt: observations.submittedAt,
      nSessions: observations.nSessions,
      rubricVersionId: observations.rubricVersionId,
    })
    .from(observations)
    .where(eq(observations.dataset, dataset));
  const obsById = new Map(obsRows.map((o) => [o.id, o]));

  const scoreRows = await db
    .select({
      id: scores.id,
      observationId: scores.observationId,
      itemNo: scores.itemNo,
      scoreNum: scores.scoreNum,
      scoreColumn: scores.scoreColumn,
      scoreDegree: scores.scoreDegree,
      justification: scores.justification,
      rubricVersionId: scores.rubricVersionId,
      lockedAt: scores.lockedAt,
      submittedAt: scores.submittedAt,
    })
    .from(scores)
    .where(and(eq(scores.dataset, dataset), isNotNull(scores.lockedAt)));
  const scoreById = new Map(scoreRows.map((s) => [s.id, s]));

  const citationRows = scoreRows.length
    ? await db
        .select({ scoreId: scoreNoteCitations.scoreId, ts: notes.videoTimestampSeconds })
        .from(scoreNoteCitations)
        .innerJoin(notes, eq(notes.id, scoreNoteCitations.noteId))
        .where(inArray(scoreNoteCitations.scoreId, scoreRows.map((s) => s.id)))
    : [];
  const citationsByScore = new Map<string, number[]>();
  for (const c of citationRows) {
    if (c.ts === null) continue;
    (citationsByScore.get(c.scoreId) ?? citationsByScore.set(c.scoreId, []).get(c.scoreId)!).push(c.ts);
  }

  // --- events (also feed minutes_on_item)
  const eventRows = await db
    .select({
      id: events.id,
      userId: events.userId,
      videoId: events.videoId,
      observationId: events.observationId,
      sessionId: events.sessionId,
      kind: events.kind,
      payload: events.payload,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(eq(events.dataset, dataset))
    .orderBy(asc(events.occurredAt));
  const eventsByObs = new Map<string, Array<{ at: Date; itemNo: number | null }>>();
  for (const e of eventRows) {
    if (!e.observationId) continue;
    const p = (e.payload ?? {}) as { itemNo?: unknown };
    const itemNo = typeof p.itemNo === "number" ? p.itemNo : null;
    (eventsByObs.get(e.observationId) ?? eventsByObs.set(e.observationId, []).get(e.observationId)!).push({
      at: e.occurredAt,
      itemNo,
    });
  }
  const minutesByObs = new Map<string, Record<number, number>>();
  for (const [obsId, evts] of eventsByObs) minutesByObs.set(obsId, minutesOnItems(evts));

  // --- calibration
  const sessionRows = await db
    .select({
      id: calibrationSessions.id,
      videoId: calibrationSessions.videoId,
      pairId: calibrationSessions.pairId,
      status: calibrationSessions.status,
      rubricVersionId: calibrationSessions.rubricVersionId,
      completedAt: calibrationSessions.completedAt,
    })
    .from(calibrationSessions)
    .where(and(eq(calibrationSessions.dataset, dataset), ne(calibrationSessions.status, "voided")));
  const sessionById = new Map(sessionRows.map((s) => [s.id, s]));
  const itemRows = sessionRows.length
    ? await db
        .select({
          id: calibrationItems.id,
          sessionId: calibrationItems.sessionId,
          itemNo: calibrationItems.itemNo,
          coderAScoreId: calibrationItems.coderAScoreId,
          coderBScoreId: calibrationItems.coderBScoreId,
          finalScoreNum: calibrationItems.finalScoreNum,
          finalScoreColumn: calibrationItems.finalScoreColumn,
          finalScoreDegree: calibrationItems.finalScoreDegree,
          resolution: calibrationItems.resolution,
          consensusRationale: calibrationItems.consensusRationale,
        })
        .from(calibrationItems)
        .where(and(eq(calibrationItems.dataset, dataset), inArray(calibrationItems.sessionId, sessionRows.map((s) => s.id))))
        .orderBy(asc(calibrationItems.itemNo))
    : [];
  const signoffRows = sessionRows.length
    ? await db
        .select({ sessionId: calibrationSignoffs.sessionId, userId: calibrationSignoffs.userId, signedAt: calibrationSignoffs.signedAt })
        .from(calibrationSignoffs)
        .where(inArray(calibrationSignoffs.sessionId, sessionRows.map((s) => s.id)))
    : [];
  const signoffBy = (sessionId: string, userId: string | null) =>
    signoffRows.find((s) => s.sessionId === sessionId && s.userId === userId)?.signedAt ?? null;

  // Coder → seat, resolved through the pair of the assignment.
  const seatOf = (pairId: string | null, coderId: string): "anchor" | "enumerator" | null => {
    if (!pairId) return null;
    const anchor = anchors.get(pairId);
    if (!anchor) return null;
    return anchor === coderId ? "anchor" : "enumerator";
  };
  const pairOfObservation = (o: (typeof obsRows)[number]) => {
    const rater = o.assignmentRaterId ? raterById.get(o.assignmentRaterId) : undefined;
    const assn = rater ? assnById.get(rater.assignmentId) : assnByVideo.get(o.videoId);
    return { assn, rater: rater ?? (assn ? raterByAssnUser.get(`${assn.id}#${o.coderId}`) : undefined) };
  };

  /* ---- clobs_scores_long ---- */
  const scoresLong: ExportRow[] = [];
  for (const s of scoreRows) {
    const o = obsById.get(s.observationId);
    if (!o) continue;
    const v = facts.get(o.videoId);
    const { assn, rater } = pairOfObservation(o);
    const mins = minutesByObs.get(o.id);
    scoresLong.push({
      ...videoCols(v),
      item_no: s.itemNo,
      item_name: rubric.itemName(s.rubricVersionId, s.itemNo),
      rater_type: "individual",
      coder_id: o.coderId,
      coder_pair_role: seatOf(assn?.pairId ?? null, o.coderId),
      pair_id: assn?.pairId ?? null,
      score_num: s.scoreNum,
      score_column: s.scoreColumn,
      score_degree: s.scoreDegree,
      justification: s.justification,
      cited_timestamps: (citationsByScore.get(s.id) ?? []).sort((a, b) => a - b).join(";") || null,
      submitted_at: s.lockedAt ?? o.submittedAt,
      n_sessions: o.nSessions,
      minutes_on_item: mins && mins[s.itemNo] !== undefined ? mins[s.itemNo] : null,
      rubric_version: rubric.labelById.get(s.rubricVersionId) ?? null,
      gold_flag: v?.isGold ?? false,
      priority_batch_flag: assn?.priorityBatchFlag ?? false,
      batch_label: assn?.batchLabel ?? null,
      previously_coded: rater?.previouslyCoded ?? false,
      rater_status: rater?.status ?? null,
      resolution: null,
      observation_id: o.id,
      score_id: s.id,
      dataset,
    });
  }
  for (const it of itemRows) {
    const sess = sessionById.get(it.sessionId);
    if (!sess || sess.status !== "completed") continue; // consensus is evidence only once signed
    const v = facts.get(sess.videoId);
    const assn = assnByVideo.get(sess.videoId);
    const aScore = scoreById.get(it.coderAScoreId);
    scoresLong.push({
      ...videoCols(v),
      item_no: it.itemNo,
      item_name: rubric.itemName(sess.rubricVersionId ?? aScore?.rubricVersionId ?? null, it.itemNo),
      rater_type: "consensus",
      coder_id: null,
      coder_pair_role: null,
      pair_id: sess.pairId,
      score_num: it.finalScoreNum,
      score_column: it.finalScoreColumn,
      score_degree: it.finalScoreDegree,
      justification: it.consensusRationale,
      cited_timestamps: null,
      submitted_at: sess.completedAt,
      n_sessions: null,
      minutes_on_item: null,
      rubric_version: rubric.labelById.get(sess.rubricVersionId ?? aScore?.rubricVersionId ?? "") ?? null,
      gold_flag: v?.isGold ?? false,
      priority_batch_flag: assn?.priorityBatchFlag ?? false,
      batch_label: assn?.batchLabel ?? null,
      previously_coded: false,
      rater_status: null,
      resolution: it.resolution,
      observation_id: null,
      score_id: it.id,
      dataset,
    });
  }
  scoresLong.sort((a, b) =>
    String(a.display_code).localeCompare(String(b.display_code)) ||
    Number(a.item_no) - Number(b.item_no) ||
    String(a.rater_type).localeCompare(String(b.rater_type)) ||
    String(a.coder_pair_role ?? "").localeCompare(String(b.coder_pair_role ?? "")),
  );

  /* ---- clobs_scores_wide (one row per codable video) ---- */
  const codable = [...facts.values()].filter((f) => f.videoId); // all live videos with provenance
  const excludedIds = new Set(
    (
      await db
        .select({ videoId: videoProvenance.videoId })
        .from(videoProvenance)
        .where(eq(videoProvenance.excluded, true))
    ).map((r) => r.videoId),
  );
  const scoresWide: ExportRow[] = [];
  for (const v of codable) {
    if (excludedIds.has(v.videoId)) continue;
    const assn = assnByVideo.get(v.videoId);
    const pairId = assn?.pairId ?? null;
    const anchorId = pairId ? anchors.get(pairId) ?? null : null;
    const raters = assn ? raterRows.filter((r) => r.assignmentId === assn.id && r.status === "active") : [];
    const enumeratorId = raters.find((r) => r.userId !== anchorId)?.userId ?? null;
    const obsForVideo = obsRows.filter((o) => o.videoId === v.videoId && o.status === "submitted");
    const sess = sessionRows.find((s) => s.videoId === v.videoId && s.status === "completed") ?? null;
    const row: ExportRow = {
      ...videoCols(v),
      pair_id: pairId,
      anchor_coder_id: anchorId,
      enumerator_coder_id: enumeratorId,
      n_submitted: obsForVideo.filter((o) => !anchorId || o.coderId === anchorId || o.coderId === enumeratorId).length,
      calibrated: !!sess,
      calibrated_at: sess?.completedAt ?? null,
      rubric_version: null,
      gold_flag: v.isGold,
      priority_batch_flag: assn?.priorityBatchFlag ?? false,
      dataset,
    };
    for (let i = 1; i <= 8; i++) {
      row[`c${i}`] = null;
      row[`a${i}`] = null;
      row[`b${i}`] = null;
    }
    const fill = (prefix: "a" | "b", coderId: string | null) => {
      if (!coderId) return;
      const o = obsForVideo.find((x) => x.coderId === coderId);
      if (!o) return;
      for (const s of scoreRows) {
        if (s.observationId !== o.id) continue;
        row[`${prefix}${s.itemNo}`] = s.scoreNum;
        row.rubric_version ??= rubric.labelById.get(s.rubricVersionId) ?? null;
      }
    };
    fill("a", anchorId);
    fill("b", enumeratorId);
    if (sess) {
      for (const it of itemRows) {
        if (it.sessionId !== sess.id) continue;
        row[`c${it.itemNo}`] = it.finalScoreNum;
      }
      if (sess.rubricVersionId) row.rubric_version = rubric.labelById.get(sess.rubricVersionId) ?? row.rubric_version;
    }
    scoresWide.push(row);
  }
  scoresWide.sort((a, b) => String(a.display_code).localeCompare(String(b.display_code)));

  /* ---- clobs_context_cards ---- */
  const cardRows = await db
    .select()
    .from(contextCards)
    .where(eq(contextCards.dataset, dataset));
  const adultRows = cardRows.length
    ? await db
        .select()
        .from(contextAdults)
        .where(inArray(contextAdults.contextCardId, cardRows.map((c) => c.id)))
    : [];
  const cards: ExportRow[] = cardRows.map((c) => {
    const v = facts.get(c.videoId);
    const row: ExportRow = {
      video: v?.displayCode ?? null,
      subject: c.subject,
      composition: c.composition,
      approx_count: c.approxCount,
      uniforms: c.uniforms,
      appearance_caveats: c.appearanceCaveats,
      room: c.room,
      camera: c.camera,
      notes: c.notes,
    };
    const adults = adultRows
      .filter((a) => a.contextCardId === c.id && !a.deletedAt)
      .sort((a, b) => a.adultNo - b.adultNo);
    for (let n = 1; n <= 6; n++) {
      const a = adults.find((x) => x.adultNo === n);
      row[`A${n}_role`] = a?.role ?? null;
      row[`A${n}_sex`] = a?.sex ?? null;
      row[`A${n}_clothing`] = a?.clothing ?? null;
      row[`A${n}_clothing_caveats`] = a?.clothingCaveats ?? null;
      row[`A${n}_features`] = a?.features ?? null;
      row[`A${n}_behavior`] = a?.behavior ?? null;
      row[`A${n}_speaks`] = a?.speaks ?? null;
    }
    const { subject: mappingSubject, ...vc } = videoCols(v);
    Object.assign(row, {
      timeline: c.timeline,
      setting_change: c.settingChange,
      ...vc,
      mapping_subject: mappingSubject,
      card_id: c.id,
      card_status: c.status,
      submitted_at: c.submittedAt,
      authored_by_coder_id: c.authoredBy,
      confirmed_by_coder_id: c.confirmedBy,
      confirmed_at: c.confirmedAt,
      flagged: c.flagged,
      flag_reason: c.flagReason,
      flag_resolved_at: c.flagResolvedAt,
      n_adults: adults.length,
      dataset,
    });
    return row;
  });
  cards.sort((a, b) => String(a.video).localeCompare(String(b.video)));

  /* ---- clobs_notes ---- */
  const noteRows = await db
    .select()
    .from(notes)
    .where(eq(notes.dataset, dataset))
    .orderBy(asc(notes.createdAt));
  const notesOut: ExportRow[] = noteRows.map((n) => {
    const o = obsById.get(n.observationId);
    const v = o ? facts.get(o.videoId) : undefined;
    return {
      note_id: n.id,
      observation_id: n.observationId,
      video_id: v?.videoId ?? null,
      display_code: v?.displayCode ?? null,
      coder_id: o?.coderId ?? null,
      video_timestamp_seconds: n.videoTimestampSeconds,
      body_html: n.body,
      body_text: htmlToText(n.body),
      created_at: n.createdAt,
      updated_at: n.updatedAt,
      deleted: !!n.deletedAt,
      dataset,
    };
  });

  /* ---- clobs_calibration ---- */
  const calibration: ExportRow[] = itemRows.map((it) => {
    const sess = sessionById.get(it.sessionId)!;
    const v = facts.get(sess.videoId);
    const a = scoreById.get(it.coderAScoreId);
    const b = scoreById.get(it.coderBScoreId);
    const aObs = a ? obsById.get(a.observationId) : undefined;
    const bObs = b ? obsById.get(b.observationId) : undefined;
    const rubricId = sess.rubricVersionId ?? a?.rubricVersionId ?? null;
    return {
      ...videoCols(v),
      session_id: sess.id,
      pair_id: sess.pairId,
      session_status: sess.status,
      item_no: it.itemNo,
      item_name: rubric.itemName(rubricId, it.itemNo),
      anchor_coder_id: aObs?.coderId ?? null,
      enumerator_coder_id: bObs?.coderId ?? null,
      anchor_score_num: a?.scoreNum ?? null,
      enumerator_score_num: b?.scoreNum ?? null,
      final_score_num: it.finalScoreNum,
      final_score_column: it.finalScoreColumn,
      final_score_degree: it.finalScoreDegree,
      resolution: it.resolution,
      consensus_rationale: it.consensusRationale,
      anchor_signed_at: signoffBy(sess.id, aObs?.coderId ?? null),
      enumerator_signed_at: signoffBy(sess.id, bObs?.coderId ?? null),
      completed_at: sess.completedAt,
      rubric_version: rubricId ? rubric.labelById.get(rubricId) ?? null : null,
      calibration_item_id: it.id,
      dataset,
    };
  });
  calibration.sort((a, b) =>
    String(a.display_code).localeCompare(String(b.display_code)) || Number(a.item_no) - Number(b.item_no),
  );

  /* ---- clobs_assignments ---- */
  const logRows = await db
    .select()
    .from(assignmentLog)
    .where(eq(assignmentLog.dataset, dataset))
    .orderBy(asc(assignmentLog.occurredAt));
  const assignmentsOut: ExportRow[] = logRows.map((l) => {
    const v = facts.get(l.videoId);
    return {
      log_id: l.id,
      occurred_at: l.occurredAt,
      action: l.action,
      ...videoCols(v),
      from_pair_id: l.fromPairId,
      to_pair_id: l.toPairId,
      from_coder_id: l.fromUserId,
      to_coder_id: l.toUserId,
      fills_context_card: l.fillsContextCard,
      seed: l.seed,
      algorithm_version: l.algorithmVersion,
      wave_no: l.waveNo,
      reason: l.reason,
      actor_id: l.actorId,
      dataset,
    };
  });

  /* ---- clobs_events ---- */
  const eventsOut: ExportRow[] = eventRows.map((e) => {
    const v = e.videoId ? facts.get(e.videoId) : undefined;
    return {
      event_id: e.id,
      occurred_at: e.occurredAt,
      kind: e.kind,
      coder_id: e.userId,
      video_id: e.videoId,
      display_code: v?.displayCode ?? null,
      observation_id: e.observationId,
      session_id: e.sessionId,
      payload_json: e.payload === null ? null : JSON.stringify(e.payload),
      dataset,
    };
  });

  /* ---- clobs_videos (crosswalk) ---- */
  const videoRows = await db
    .select({
      videoId: videos.id,
      displayCode: videos.displayCode,
      status: videos.status,
      isGold: videos.isGold,
      durationSeconds: videos.durationSeconds,
      driveUrl: videos.driveUrl,
      rawFilename: videoProvenance.rawFilename,
      recordedYear: videoProvenance.recordedYear,
      excluded: videoProvenance.excluded,
      excludedReason: videoProvenance.excludedReason,
      importBatch: videoProvenance.importBatch,
    })
    .from(videos)
    .innerJoin(videoProvenance, eq(videoProvenance.videoId, videos.id))
    .where(eq(videos.dataset, dataset))
    .orderBy(asc(videos.displayCode));
  const videosOut: ExportRow[] = videoRows.map((r) => ({
    ...videoCols(facts.get(r.videoId)),
    raw_filename: r.rawFilename,
    recorded_year: r.recordedYear,
    status: r.status,
    is_gold: r.isGold,
    excluded: r.excluded,
    excluded_reason: r.excludedReason,
    import_batch: r.importBatch,
    duration_seconds: r.durationSeconds,
    has_drive_link: !!r.driveUrl,
    dataset,
  }));

  /* ---- clobs_coders ---- */
  const coderIds = new Set<string>();
  for (const o of obsRows) coderIds.add(o.coderId);
  for (const r of raterRows) coderIds.add(r.userId);
  for (const l of logRows) {
    if (l.actorId) coderIds.add(l.actorId);
    if (l.toUserId) coderIds.add(l.toUserId);
    if (l.fromUserId) coderIds.add(l.fromUserId);
  }
  for (const c of cardRows) {
    coderIds.add(c.authoredBy);
    if (c.confirmedBy) coderIds.add(c.confirmedBy);
  }
  const coderRows = coderIds.size
    ? await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          isChiefCoder: users.isChiefCoder,
          isActive: users.isActive,
          datasetScope: users.datasetScope,
        })
        .from(users)
        .where(inArray(users.id, [...coderIds]))
        .orderBy(asc(users.email))
    : [];
  const codersOut: ExportRow[] = coderRows.map((u) => ({
    coder_id: u.id,
    display_name: u.name ?? u.email,
    email: u.email,
    role: u.role,
    is_chief_coder: u.isChiefCoder,
    is_active: u.isActive,
    dataset_scope: u.datasetScope,
  }));

  return {
    rows: {
      [SCORES_LONG.name]: scoresLong,
      [SCORES_WIDE.name]: scoresWide,
      [CONTEXT_CARDS.name]: cards,
      [NOTES.name]: notesOut,
      [CALIBRATION.name]: calibration,
      [ASSIGNMENTS.name]: assignmentsOut,
      [EVENTS.name]: eventsOut,
      [VIDEOS.name]: videosOut,
      [CODERS.name]: codersOut,
    },
    rubricVersionId: rubric.active?.id ?? null,
    rubricVersionLabel: rubric.active?.label ?? null,
    items: rubric.activeItems,
  };
}

/** The one dataset rule, applied to the assembled rows (tested). */
export function assertLiveOnly(rows: Record<string, ExportRow[]>): void {
  for (const [table, list] of Object.entries(rows)) {
    for (const r of list) {
      if ("dataset" in r && r.dataset !== LIVE) {
        throw new Error(`Export refused: ${table} contains a ${String(r.dataset)} row`);
      }
    }
  }
}

/* ------------------------------ files ------------------------------ */

interface BuiltFile {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileRow(exportId: string, f: BuiltFile) {
  return {
    exportId,
    filename: f.filename,
    contentType: f.contentType,
    byteSize: f.bytes.length,
    sha256: sha256(f.bytes),
    content: Buffer.from(f.bytes),
  };
}

function platformVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 12) : "local-dev";
}

export interface CreatedExport {
  exportId: string;
  requestedAt: Date;
  rowCounts: Record<string, number>;
  files: Array<{ filename: string; byteSize: number; sha256: string }>;
}

/**
 * Generate and store a complete export. One transaction: the exports row,
 * every file, the audit entry. Nothing is written if any step fails.
 */
export async function createExport(actorId: string): Promise<CreatedExport> {
  const built = await buildExportTables();
  assertLiveOnly(built.rows);
  const [actor] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, actorId));
  const requestedBy = actor?.name ?? actor?.email ?? actorId;
  const now = new Date();
  const rowCounts: Record<string, number> = {};
  for (const t of EXPORT_TABLES) rowCounts[t.name] = built.rows[t.name]?.length ?? 0;

  return db.transaction(async (tx) => {
    const [exp] = await tx
      .insert(exportsTable)
      .values({ requestedBy: actorId, requestedAt: now, rubricVersionId: built.rubricVersionId, rowCounts })
      .returning({ id: exportsTable.id });

    const files: BuiltFile[] = [];
    const enc = new TextEncoder();
    for (const t of EXPORT_TABLES) {
      const rows = built.rows[t.name] ?? [];
      files.push({ filename: `${t.name}.csv`, contentType: "text/csv; charset=utf-8", bytes: enc.encode(toCsv(t, rows)) });
      files.push({
        filename: `${t.name}.dta`,
        contentType: "application/x-stata-dta",
        bytes: toDta(t, rows, { label: `${t.name} — CLOBS export ${now.toISOString().slice(0, 10)}`, now }),
      });
    }
    const codebookInput = {
      exportId: exp.id,
      generatedAt: now,
      rubricVersion: built.rubricVersionLabel,
      items: built.items,
      rowCounts,
      requestedBy,
      platformVersion: platformVersion(),
    };
    files.push({
      filename: "codebook.json",
      contentType: "application/json",
      bytes: enc.encode(JSON.stringify(buildCodebookJson(codebookInput), null, 2)),
    });
    files.push({
      filename: "codebook.md",
      contentType: "text/markdown; charset=utf-8",
      bytes: enc.encode(buildCodebookMarkdown(codebookInput)),
    });
    const manifest = {
      export_id: exp.id,
      generated_at: now.toISOString(),
      requested_by: requestedBy,
      rubric_version: built.rubricVersionLabel,
      platform_version: platformVersion(),
      row_counts: rowCounts,
      files: files.map((f) => ({ filename: f.filename, byte_size: f.bytes.length, sha256: sha256(f.bytes) })),
    };
    files.push({ filename: "manifest.json", contentType: "application/json", bytes: enc.encode(JSON.stringify(manifest, null, 2)) });

    for (const f of files) await tx.insert(exportFiles).values(fileRow(exp.id, f));
    await tx.update(exportsTable).set({ manifest }).where(eq(exportsTable.id, exp.id));
    await tx.insert(auditLog).values({
      actorId,
      action: "export_created",
      subjectTable: "exports",
      subjectId: exp.id,
      details: { rowCounts, files: files.length, rubricVersion: built.rubricVersionLabel },
    });
    return {
      exportId: exp.id,
      requestedAt: now,
      rowCounts,
      files: files.map((f) => ({ filename: f.filename, byteSize: f.bytes.length, sha256: sha256(f.bytes) })),
    };
  });
}

/* ------------------------------ reading ------------------------------ */

export interface ExportListRow {
  id: string;
  requestedAt: Date;
  requestedBy: string;
  rubricVersion: string | null;
  rowCounts: Record<string, number>;
  files: Array<{ filename: string; byteSize: number }>;
  totalBytes: number;
}

export async function listExports(limit = 50): Promise<ExportListRow[]> {
  const rows = await db
    .select({
      id: exportsTable.id,
      requestedAt: exportsTable.requestedAt,
      requesterName: users.name,
      requesterEmail: users.email,
      rubricVersion: rubricVersions.versionLabel,
      rowCounts: exportsTable.rowCounts,
    })
    .from(exportsTable)
    .innerJoin(users, eq(users.id, exportsTable.requestedBy))
    .leftJoin(rubricVersions, eq(rubricVersions.id, exportsTable.rubricVersionId))
    .orderBy(desc(exportsTable.requestedAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const files = await db
    .select({ exportId: exportFiles.exportId, filename: exportFiles.filename, byteSize: exportFiles.byteSize })
    .from(exportFiles)
    .where(inArray(exportFiles.exportId, rows.map((r) => r.id)))
    .orderBy(asc(exportFiles.filename));
  return rows.map((r) => {
    const mine = files.filter((f) => f.exportId === r.id);
    return {
      id: r.id,
      requestedAt: r.requestedAt,
      requestedBy: r.requesterName ?? r.requesterEmail,
      rubricVersion: r.rubricVersion,
      rowCounts: (r.rowCounts ?? {}) as Record<string, number>,
      files: mine.map((f) => ({ filename: f.filename, byteSize: f.byteSize })),
      totalBytes: mine.reduce((s, f) => s + f.byteSize, 0),
    };
  });
}

/** One stored file, byte-for-byte, with the download audited. */
export async function getExportFile(
  actorId: string,
  exportId: string,
  filename: string,
): Promise<{ contentType: string; bytes: Buffer } | null> {
  const [f] = await db
    .select({ contentType: exportFiles.contentType, content: exportFiles.content })
    .from(exportFiles)
    .where(and(eq(exportFiles.exportId, exportId), eq(exportFiles.filename, filename)))
    .limit(1);
  if (!f) return null;
  await db.insert(auditLog).values({
    actorId,
    action: "export_downloaded",
    subjectTable: "exports",
    subjectId: exportId,
    details: { filename },
  });
  return { contentType: f.contentType, bytes: Buffer.from(f.content) };
}

/** Every stored file of an export as one ZIP (assembled from storage, so the
 *  contents are identical to the individual downloads). */
export async function getExportBundle(
  actorId: string,
  exportId: string,
): Promise<{ filename: string; bytes: Uint8Array } | null> {
  const [exp] = await db
    .select({ requestedAt: exportsTable.requestedAt })
    .from(exportsTable)
    .where(eq(exportsTable.id, exportId))
    .limit(1);
  if (!exp) return null;
  const files = await db
    .select({ filename: exportFiles.filename, content: exportFiles.content })
    .from(exportFiles)
    .where(eq(exportFiles.exportId, exportId))
    .orderBy(asc(exportFiles.filename));
  if (files.length === 0) return null;
  await db.insert(auditLog).values({
    actorId,
    action: "export_downloaded",
    subjectTable: "exports",
    subjectId: exportId,
    details: { filename: "bundle.zip", files: files.length },
  });
  const stamp = exp.requestedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return {
    filename: `clobs-export-${stamp}-${exportId.slice(0, 8)}.zip`,
    bytes: toZip(
      files.map((f) => ({ name: f.filename, data: new Uint8Array(f.content), mtime: exp.requestedAt })),
      exp.requestedAt,
    ),
  };
}

/** Which contract table a file belongs to (for the screen). */
export function tableForFile(filename: string): ExportTable | null {
  const base = filename.replace(/\.(csv|dta)$/, "");
  return EXPORT_TABLES.find((t) => t.name === base) ?? null;
}
