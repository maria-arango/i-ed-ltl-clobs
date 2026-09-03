/**
 * THE EXPORT CONTRACT (addendum §12, Amendments A + B §1/§5/§6).
 *
 * This file is data, not code paths: every export table is declared here
 * once — column order, type, label, value codes — and the same declaration
 * drives the CSV header, the Stata variable/value labels, the codebook and
 * the contract test. Change a column here and every artifact changes with
 * it; nothing else defines a column name.
 *
 * Conventions:
 *  - snake_case names ≤ 32 chars (Stata's limit), unique within a table.
 *  - `codes` marks a categorical text column: the CSV carries the text,
 *    the .dta carries the integer with a value label (documented in the
 *    codebook). Booleans are 1/0 in both formats.
 *  - `long: true` marks free text that may exceed Stata's 2045-byte str
 *    limit; it is written as strL.
 *  - Identifiers are UUIDs and display codes, which never change once
 *    created, so identifiers are stable across exports (§12).
 *  - Every table carries `dataset`, which is always 'live' (tested).
 */

export type ColumnType = "str" | "int" | "float" | "bool" | "datetime";

export interface ExportColumn {
  name: string;
  type: ColumnType;
  /** Stata variable label (≤ 80 chars) — also the codebook's short label. */
  label: string;
  /** Longer explanation for the codebook. */
  description?: string;
  /** Categorical text → integer code (dta value labels). */
  codes?: Record<string, number>;
  /** Integer value labels (e.g. the score encoding). */
  valueLabels?: Record<number, string>;
  /** Free text that may be long; written as strL in the .dta. */
  long?: boolean;
  /** Unblinded field (school / arm / teacher / raw filename). */
  unblinded?: boolean;
}

export interface ExportTable {
  name: string;
  /** One sentence: what a row is. */
  unit: string;
  description: string;
  columns: ExportColumn[];
}

/* ------------------------------ shared codes ------------------------------ */

export const SCORE_VALUE_LABELS: Record<number, string> = {
  1: "A Very",
  2: "A Somewhat",
  3: "B Somewhat",
  4: "B Very",
};

export const ARM_CODES = { control: 1, dispersed: 2, connected: 3 } as const;
export const RATER_TYPE_CODES = { individual: 1, consensus: 2 } as const;
export const PAIR_ROLE_CODES = { anchor: 1, enumerator: 2 } as const;
export const RESOLUTION_CODES = {
  agreed: 1,
  a_moved: 2,
  b_moved: 3,
  both_moved: 4,
} as const;
export const RATER_STATUS_CODES = { active: 1, transferred: 2, voided: 3 } as const;
export const OBSERVATION_STATUS_CODES = {
  not_started: 1,
  in_progress: 2,
  submitted: 3,
} as const;
export const CARD_STATUS_CODES = { draft: 1, submitted: 2 } as const;
export const COMPOSITION_CODES = { all_boys: 1, all_girls: 2, mixed: 3 } as const;
export const ADULT_ROLE_CODES = { teacher: 1, camera_operator: 2, other: 3 } as const;
export const SEX_CODES = { male: 1, female: 2, unknown: 3 } as const;
export const SPEAKS_CODES = { yes: 1, no: 0 } as const;
export const VIDEO_STATUS_CODES = {
  pool: 1,
  assigned: 2,
  in_progress: 3,
  complete: 4,
  unusable: 5,
  void: 6,
} as const;
export const SESSION_STATUS_CODES = {
  scheduled: 1,
  lobby: 2,
  open: 3,
  completed: 4,
  voided: 5,
} as const;
export const ASSIGNMENT_ACTION_CODES = {
  assign: 1,
  reassign: 2,
  return_to_pool: 3,
  void: 4,
  transfer_card_duty: 5,
} as const;
export const ASSIGNMENT_STATUS_CODES = {
  active: 1,
  returned: 2,
  voided: 3,
  completed: 4,
} as const;
export const ROLE_CODES = { admin: 1, coder: 2 } as const;
export const DATASET_CODES = { live: 1, test: 2, training: 3 } as const;

/* ------------------------------ column kits ------------------------------ */

const videoIdentity: ExportColumn[] = [
  { name: "video_id", type: "str", label: "Video id (UUID, stable)" },
  { name: "display_code", type: "str", label: "Opaque display code shown to coders (V-0417)" },
];

const unblindedVideo: ExportColumn[] = [
  { name: "sid", type: "str", label: "School id (recording school)", unblinded: true },
  { name: "tr_id", type: "str", label: "Teacher id (sid_teacher)", unblinded: true },
  {
    name: "arm",
    type: "str",
    label: "School treatment arm",
    codes: ARM_CODES,
    unblinded: true,
    description: "Empty when the school's arm is unresolved (school 22103 at import).",
  },
  { name: "teacher_assignment", type: "str", label: "Teacher-level assignment", unblinded: true },
  { name: "subject", type: "str", label: "Lesson subject (from the mapping file)", unblinded: true },
];

const datasetCol: ExportColumn = {
  name: "dataset",
  type: "str",
  label: "Dataset (always live in exports)",
  codes: DATASET_CODES,
};

const scoreTriple = (prefix: string, who: string): ExportColumn[] => [
  {
    name: `${prefix}score_num`,
    type: "int",
    label: `${who} score 1-4 (1=A Very … 4=B Very)`,
    valueLabels: SCORE_VALUE_LABELS,
  },
  { name: `${prefix}score_column`, type: "str", label: `${who} score column (A/B)` },
  { name: `${prefix}score_degree`, type: "str", label: `${who} score degree (somewhat/very)` },
];

/** A1_…A6_ blocks exactly as in context_cards_v3.xlsx (Amendment B §1). */
function adultBlock(n: number): ExportColumn[] {
  return [
    { name: `A${n}_role`, type: "str", label: `Adult ${n}: role`, codes: ADULT_ROLE_CODES },
    { name: `A${n}_sex`, type: "str", label: `Adult ${n}: sex`, codes: SEX_CODES },
    { name: `A${n}_clothing`, type: "str", label: `Adult ${n}: clothing`, long: true },
    { name: `A${n}_clothing_caveats`, type: "str", label: `Adult ${n}: clothing caveats`, long: true },
    { name: `A${n}_features`, type: "str", label: `Adult ${n}: distinguishing features`, long: true },
    { name: `A${n}_behavior`, type: "str", label: `Adult ${n}: behaviour`, long: true },
    { name: `A${n}_speaks`, type: "str", label: `Adult ${n}: speaks on camera`, codes: SPEAKS_CODES },
  ];
}

/* --------------------------------- tables --------------------------------- */

export const SCORES_LONG: ExportTable = {
  name: "clobs_scores_long",
  unit: "one row per video × item × rater; rater = an individual coder or the pair consensus",
  description:
    "The primary AI-training table. Individual rows come from locked score records; consensus rows from signed calibration items. Justification carries the coder's justification for individual rows and the shared consensus rationale for consensus rows.",
  columns: [
    ...videoIdentity,
    ...unblindedVideo,
    { name: "item_no", type: "int", label: "Rubric item 1-8" },
    { name: "item_name", type: "str", label: "Rubric concept name (from the rubric version)" },
    { name: "rater_type", type: "str", label: "individual or consensus", codes: RATER_TYPE_CODES },
    { name: "coder_id", type: "str", label: "Coder id (UUID); empty for consensus rows" },
    {
      name: "coder_pair_role",
      type: "str",
      label: "Coder's seat in the pair: anchor or enumerator",
      codes: PAIR_ROLE_CODES,
    },
    { name: "pair_id", type: "str", label: "Pair id (UUID) the video was coded under" },
    ...scoreTriple("", "Score:"),
    { name: "justification", type: "str", label: "Justification / consensus rationale", long: true },
    {
      name: "cited_timestamps",
      type: "str",
      label: "Cited note timestamps (seconds, ;-joined)",
      description: "From optional note→justification citations (Amendment B §4). Usually empty.",
    },
    { name: "submitted_at", type: "datetime", label: "When the individual scores locked / consensus signed" },
    { name: "n_sessions", type: "int", label: "Coding sessions the observation took (resume count)" },
    {
      name: "minutes_on_item",
      type: "float",
      label: "Minutes attributed to this item (derived from events)",
      description:
        "Derived at export time from the event log: each gap between consecutive events of the observation is attributed to the item of the earlier event (score_selected / score_changed carry the item). Gaps longer than 30 minutes are treated as idle and dropped. Empty when no item events exist. Consensus rows: empty.",
    },
    { name: "rubric_version", type: "str", label: "Rubric version label the score was made against" },
    { name: "gold_flag", type: "bool", label: "Video is in the gold set" },
    { name: "priority_batch_flag", type: "bool", label: "Assignment flagged as a priority batch (§6)" },
    { name: "batch_label", type: "str", label: "Named batch (e.g. the admin recode set)" },
    { name: "previously_coded", type: "bool", label: "Coder had coded this video under the old rubric" },
    {
      name: "rater_status",
      type: "str",
      label: "Rater row status: active, transferred, voided",
      codes: RATER_STATUS_CODES,
      description: "Voided/transferred rows are preserved evidence from reassignment; filter on active for the analysis sample.",
    },
    {
      name: "resolution",
      type: "str",
      label: "Consensus rows: agreed, a_moved (anchor), b_moved (enumerator), both_moved",
      codes: RESOLUTION_CODES,
    },
    { name: "observation_id", type: "str", label: "Observation id (UUID); empty for consensus" },
    { name: "score_id", type: "str", label: "Score row id / calibration item id (UUID)" },
    datasetCol,
  ],
};

export const SCORES_WIDE: ExportTable = {
  name: "clobs_scores_wide",
  unit: "one row per codable video",
  description:
    "Quick-analysis pivot of the same records: consensus score per item (c1-c8), anchor's individual scores (a1-a8), enumerator's (b1-b8). Empty where the stage has not been reached.",
  columns: [
    ...videoIdentity,
    ...unblindedVideo,
    { name: "pair_id", type: "str", label: "Pair id (UUID)" },
    { name: "anchor_coder_id", type: "str", label: "Anchor coder id (UUID)" },
    { name: "enumerator_coder_id", type: "str", label: "Enumerator coder id (UUID)" },
    { name: "n_submitted", type: "int", label: "Individual observations submitted (0-2)" },
    { name: "calibrated", type: "bool", label: "Calibration signed by both" },
    { name: "calibrated_at", type: "datetime", label: "When the calibration completed" },
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
      name: `c${i}`,
      type: "int" as const,
      label: `Consensus score item ${i}`,
      valueLabels: SCORE_VALUE_LABELS,
    })),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
      name: `a${i}`,
      type: "int" as const,
      label: `Anchor's individual score item ${i}`,
      valueLabels: SCORE_VALUE_LABELS,
    })),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
      name: `b${i}`,
      type: "int" as const,
      label: `Enumerator's individual score item ${i}`,
      valueLabels: SCORE_VALUE_LABELS,
    })),
    { name: "rubric_version", type: "str", label: "Rubric version of the consensus (or individual) scores" },
    { name: "gold_flag", type: "bool", label: "Video is in the gold set" },
    { name: "priority_batch_flag", type: "bool", label: "Assignment flagged as a priority batch" },
    datasetCol,
  ],
};

export const CONTEXT_CARDS: ExportTable = {
  name: "clobs_context_cards",
  unit: "one row per video (one card per video, Amendments A + B §1)",
  description:
    "The single-table card with adults flattened into A1_…A6_ blocks, matching context_cards_v3.xlsx. Videos without a card yet are absent.",
  columns: [
    { name: "video", type: "str", label: "Display code (the pilot sheet's first column)" },
    { name: "subject", type: "str", label: "Subject as observed" },
    { name: "composition", type: "str", label: "Class composition", codes: COMPOSITION_CODES },
    { name: "approx_count", type: "str", label: "Approximate pupil count (number, range or unknown)" },
    { name: "uniforms", type: "str", label: "Uniform description", long: true },
    { name: "appearance_caveats", type: "str", label: "Appearance caveats", long: true },
    { name: "room", type: "str", label: "Room description", long: true },
    { name: "camera", type: "str", label: "Camera position", long: true },
    { name: "notes", type: "str", label: "Card notes", long: true },
    ...[1, 2, 3, 4, 5, 6].flatMap(adultBlock),
    { name: "timeline", type: "str", label: "How the lesson unfolded", long: true },
    { name: "setting_change", type: "str", label: "Mid-recording setting change (rare)", long: true },
    ...videoIdentity,
    // The card has its own observed `subject`; the mapping file's subject
    // is renamed here to keep both.
    ...unblindedVideo.filter((c) => c.name !== "subject"),
    { name: "mapping_subject", type: "str", label: "Lesson subject from the mapping file", unblinded: true },
    { name: "card_id", type: "str", label: "Card id (UUID)" },
    { name: "card_status", type: "str", label: "draft or submitted", codes: CARD_STATUS_CODES },
    { name: "submitted_at", type: "datetime", label: "When the card was submitted" },
    { name: "authored_by_coder_id", type: "str", label: "Coder who filled the card (UUID)" },
    { name: "confirmed_by_coder_id", type: "str", label: "Second coder who confirmed it (UUID)" },
    { name: "confirmed_at", type: "datetime", label: "When confirmed" },
    { name: "flagged", type: "bool", label: "Second coder flagged a problem (open flag)" },
    { name: "flag_reason", type: "str", label: "Flag reason", long: true },
    { name: "flag_resolved_at", type: "datetime", label: "When a flag was resolved by resubmission" },
    { name: "n_adults", type: "int", label: "Adults recorded (0-6)" },
    datasetCol,
  ],
};

export const NOTES: ExportTable = {
  name: "clobs_notes",
  unit: "one row per note (one rich-text document per observation, Amendment §16)",
  description: "Coder notes as stored HTML plus a derived plain-text column. Soft-deleted notes are included with deleted=1.",
  columns: [
    { name: "note_id", type: "str", label: "Note id (UUID)" },
    { name: "observation_id", type: "str", label: "Observation id (UUID)" },
    ...videoIdentity,
    { name: "coder_id", type: "str", label: "Coder id (UUID)" },
    { name: "video_timestamp_seconds", type: "int", label: "Optional video minute stamp (seconds)" },
    { name: "body_html", type: "str", label: "Note body as stored (HTML)", long: true },
    { name: "body_text", type: "str", label: "Note body as plain text (derived)", long: true },
    { name: "created_at", type: "datetime", label: "Created" },
    { name: "updated_at", type: "datetime", label: "Last saved" },
    { name: "deleted", type: "bool", label: "Soft-deleted by the coder" },
    datasetCol,
  ],
};

export const CALIBRATION: ExportTable = {
  name: "clobs_calibration",
  unit: "one row per video × item of a non-voided calibration session",
  description:
    "Both individual scores, the final score, who moved, and the shared consensus rationale. Coder A is always the anchor and coder B the enumerator.",
  columns: [
    ...videoIdentity,
    ...unblindedVideo,
    { name: "session_id", type: "str", label: "Calibration session id (UUID)" },
    { name: "pair_id", type: "str", label: "Pair id (UUID)" },
    {
      name: "session_status",
      type: "str",
      label: "scheduled, lobby, open, completed",
      codes: SESSION_STATUS_CODES,
    },
    { name: "item_no", type: "int", label: "Rubric item 1-8" },
    { name: "item_name", type: "str", label: "Rubric concept name" },
    { name: "anchor_coder_id", type: "str", label: "Anchor (coder A) id" },
    { name: "enumerator_coder_id", type: "str", label: "Enumerator (coder B) id" },
    { name: "anchor_score_num", type: "int", label: "Anchor's individual score", valueLabels: SCORE_VALUE_LABELS },
    {
      name: "enumerator_score_num",
      type: "int",
      label: "Enumerator's individual score",
      valueLabels: SCORE_VALUE_LABELS,
    },
    ...scoreTriple("final_", "Final (consensus)"),
    {
      name: "resolution",
      type: "str",
      label: "agreed, a_moved (anchor moved), b_moved (enumerator moved), both_moved",
      codes: RESOLUTION_CODES,
    },
    { name: "consensus_rationale", type: "str", label: "Shared consensus rationale", long: true },
    { name: "anchor_signed_at", type: "datetime", label: "Anchor's signature" },
    { name: "enumerator_signed_at", type: "datetime", label: "Enumerator's signature" },
    { name: "completed_at", type: "datetime", label: "Session completed (second signature)" },
    { name: "rubric_version", type: "str", label: "Rubric version" },
    { name: "calibration_item_id", type: "str", label: "Calibration item id (UUID)" },
    datasetCol,
  ],
};

export const ASSIGNMENTS: ExportTable = {
  name: "clobs_assignments",
  unit: "one row per assignment-log entry (append-only history with seeds and reasons)",
  description:
    "Every assignment, reassignment, return to pool, void and card-duty transfer, with the seed and algorithm version that produced it (§6) and fills_context_card (Amendment A).",
  columns: [
    { name: "log_id", type: "str", label: "Log entry id (UUID)" },
    { name: "occurred_at", type: "datetime", label: "When" },
    {
      name: "action",
      type: "str",
      label: "assign, reassign, return_to_pool, void, transfer_card_duty",
      codes: ASSIGNMENT_ACTION_CODES,
    },
    ...videoIdentity,
    ...unblindedVideo,
    { name: "from_pair_id", type: "str", label: "Pair the video left (UUID)" },
    { name: "to_pair_id", type: "str", label: "Pair the video went to (UUID)" },
    { name: "from_coder_id", type: "str", label: "Coder the work left (UUID)" },
    { name: "to_coder_id", type: "str", label: "Coder the work went to (UUID)" },
    { name: "fills_context_card", type: "bool", label: "This coder fills the context card" },
    { name: "seed", type: "str", label: "Seed of the wave / rotation" },
    { name: "algorithm_version", type: "str", label: "Assignment algorithm version" },
    { name: "wave_no", type: "int", label: "Wave number" },
    { name: "reason", type: "str", label: "Recorded reason (reassignments, voids)", long: true },
    { name: "actor_id", type: "str", label: "Admin who acted (UUID)" },
    datasetCol,
  ],
};

export const EVENTS: ExportTable = {
  name: "clobs_events",
  unit: "one row per instrumentation event",
  description: "The raw event log (addendum §8) for the timing analysis. payload_json is the event's JSON payload verbatim.",
  columns: [
    { name: "event_id", type: "str", label: "Event id (UUID)" },
    { name: "occurred_at", type: "datetime", label: "When" },
    { name: "kind", type: "str", label: "Event kind (e.g. score_selected, observation_submitted)" },
    { name: "coder_id", type: "str", label: "Coder id (UUID)" },
    ...videoIdentity,
    { name: "observation_id", type: "str", label: "Observation id (UUID)" },
    { name: "session_id", type: "str", label: "Calibration session id (UUID)" },
    { name: "payload_json", type: "str", label: "Payload (JSON)", long: true },
    datasetCol,
  ],
};

export const VIDEOS: ExportTable = {
  name: "clobs_videos",
  unit: "one row per imported video (session), including excluded ones",
  description:
    "The display-code ↔ true-id crosswalk (Amendment B §6) with status and gold flag. ADMIN-ONLY BY DEFINITION: this table unblinds every other one.",
  columns: [
    ...videoIdentity,
    { name: "raw_filename", type: "str", label: "Filename prefix / name from the mapping file", unblinded: true },
    ...unblindedVideo,
    { name: "recorded_year", type: "int", label: "Recording year" },
    { name: "status", type: "str", label: "pool, assigned, in_progress, complete, unusable, void", codes: VIDEO_STATUS_CODES },
    { name: "is_gold", type: "bool", label: "Gold-set video" },
    { name: "excluded", type: "bool", label: "Excluded at import (never assigned)" },
    { name: "excluded_reason", type: "str", label: "Why excluded" },
    { name: "import_batch", type: "str", label: "Import batch label" },
    { name: "duration_seconds", type: "int", label: "Video duration (seconds), when known" },
    { name: "has_drive_link", type: "bool", label: "A Drive link is attached" },
    datasetCol,
  ],
};

export const CODERS: ExportTable = {
  name: "clobs_coders",
  unit: "one row per account that appears in the live data",
  description: "Maps coder ids to people, roles and seats. Identifying: keep with the crosswalk, not with the AI-training tables.",
  columns: [
    { name: "coder_id", type: "str", label: "Coder id (UUID)" },
    { name: "display_name", type: "str", label: "Name (or email when no name)" },
    { name: "email", type: "str", label: "Sign-in email" },
    { name: "role", type: "str", label: "admin or coder", codes: ROLE_CODES },
    { name: "is_chief_coder", type: "bool", label: "Chief coder (anchor-eligible)" },
    { name: "is_active", type: "bool", label: "Account active" },
    {
      name: "dataset_scope",
      type: "str",
      label: "live or training (trainee)",
      codes: DATASET_CODES,
    },
  ],
};

/** Every table of the export set, in delivery order. */
export const EXPORT_TABLES: readonly ExportTable[] = [
  SCORES_LONG,
  SCORES_WIDE,
  CONTEXT_CARDS,
  NOTES,
  CALIBRATION,
  ASSIGNMENTS,
  EVENTS,
  VIDEOS,
  CODERS,
];

/** A row is a plain object keyed by column name. */
export type ExportRow = Record<string, string | number | boolean | Date | null>;

/** Sanity: names are Stata-legal, unique, and ≤ 32 chars. Used by the test. */
export function validateContract(tables: readonly ExportTable[] = EXPORT_TABLES): string[] {
  const problems: string[] = [];
  const tableNames = new Set<string>();
  for (const t of tables) {
    if (tableNames.has(t.name)) problems.push(`duplicate table ${t.name}`);
    tableNames.add(t.name);
    const seen = new Set<string>();
    for (const c of t.columns) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(c.name)) {
        problems.push(`${t.name}.${c.name}: not a legal Stata variable name`);
      }
      if (seen.has(c.name)) problems.push(`${t.name}.${c.name}: duplicate column`);
      seen.add(c.name);
      if (c.label.length > 80) problems.push(`${t.name}.${c.name}: label over 80 chars`);
      if (c.codes && c.type !== "str") problems.push(`${t.name}.${c.name}: codes need type str`);
      if (c.valueLabels && c.type !== "int") problems.push(`${t.name}.${c.name}: valueLabels need type int`);
    }
  }
  return problems;
}
