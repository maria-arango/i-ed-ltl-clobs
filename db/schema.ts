/**
 * LTL CLOBS database schema — the implementation of docs/03-data-model.md.
 * Section numbers in comments refer to that document.
 *
 * Invariants enforced here rather than in application code:
 * - `dataset` is NOT NULL on every table holding coder-generated or
 *   assignment content, from this first migration (ADR 0001).
 * - The score encoding (CLAUDE.md §4) is stored as three separate fields
 *   with a CHECK that the triple is one of the four legal combinations:
 *   1=A/very, 2=A/somewhat, 3=B/somewhat, 4=B/very. Reads never re-derive.
 * - Exactly one rater per assignment fills the context card (Amendment A):
 *   partial unique index on assignment_raters.
 * - school/arm/teacher identifiers exist ONLY in video_provenance (and,
 *   implicitly, gold_scores) — never on coder-reachable tables (§3).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const roleEnum = pgEnum("role", ["admin", "coder"]);
export const datasetEnum = pgEnum("dataset", ["live", "test", "training"]);
export const armEnum = pgEnum("arm", ["control", "dispersed", "connected"]);
export const videoStatusEnum = pgEnum("video_status", [
  "pool",
  "assigned",
  "in_progress",
  "complete",
  "unusable",
  "void",
]);
export const assignmentStatusEnum = pgEnum("assignment_status", [
  "active",
  "returned",
  "voided",
  "completed",
]);
export const raterStatusEnum = pgEnum("rater_status", [
  "active",
  "transferred",
  "voided",
]);
export const assignmentActionEnum = pgEnum("assignment_action", [
  "assign",
  "reassign",
  "return_to_pool",
  "void",
  "transfer_card_duty",
]);
export const observationStatusEnum = pgEnum("observation_status", [
  "not_started",
  "in_progress",
  "submitted",
]);
export const scoreColumnEnum = pgEnum("score_column", ["A", "B"]);
export const scoreDegreeEnum = pgEnum("score_degree", ["somewhat", "very"]);
export const cardStatusEnum = pgEnum("card_status", ["draft", "submitted"]);
export const compositionEnum = pgEnum("composition", [
  "all_boys",
  "all_girls",
  "mixed",
]);
export const adultRoleEnum = pgEnum("adult_role", [
  "teacher",
  "camera_operator",
  "other",
]);
export const sexEnum = pgEnum("sex", ["male", "female", "unknown"]);
export const speaksEnum = pgEnum("speaks", ["yes", "no"]);
export const calibrationStatusEnum = pgEnum("calibration_status", [
  "scheduled",
  "lobby",
  "open",
  "completed",
  "voided",
]);
export const resolutionEnum = pgEnum("resolution", [
  "agreed",
  "a_moved",
  "b_moved",
  "both_moved",
]);
export const certificationStatusEnum = pgEnum("certification_status", [
  "in_progress",
  "passed",
  "failed",
]);
export const guidanceKindEnum = pgEnum("guidance_kind", [
  "guiding_rule",
  "reach_band",
]);

/** The one legal score encoding (CLAUDE.md §4), reused wherever a score triple is stored. */
const scoreTripleCheck = (num: string, col: string, deg: string) =>
  sql`(${sql.raw(num)} = 1 AND ${sql.raw(col)} = 'A' AND ${sql.raw(deg)} = 'very')
   OR (${sql.raw(num)} = 2 AND ${sql.raw(col)} = 'A' AND ${sql.raw(deg)} = 'somewhat')
   OR (${sql.raw(num)} = 3 AND ${sql.raw(col)} = 'B' AND ${sql.raw(deg)} = 'somewhat')
   OR (${sql.raw(num)} = 4 AND ${sql.raw(col)} = 'B' AND ${sql.raw(deg)} = 'very')`;

/* ------------------------------------------------------------------ */
/* §4.1 People and access (users table doubles as the Auth.js table)   */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  role: roleEnum("role").notNull().default("coder"),
  isChiefCoder: boolean("is_chief_coder").notNull().default(false),
  // `training` is what makes an account a trainee (Amendment B §9).
  datasetScope: datasetEnum("dataset_scope").notNull().default("live"),
  isActive: boolean("is_active").notNull().default(true),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  deactivatedReason: text("deactivated_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Auth.js (v5) adapter tables — standard shapes, do not repurpose.
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const coderAvailability = pgTable("coder_availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  fteFraction: integer("fte_percent").notNull(), // 0–100, whole percent
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pairs = pgTable("pairs", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label"),
  dataset: datasetEnum("dataset").notNull().default("live"),
  formedAt: timestamp("formed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  dissolvedAt: timestamp("dissolved_at", { withTimezone: true }),
  dissolvedReason: text("dissolved_reason"),
});

// Pairing rule (Amendment B): exactly one anchor (admin or chief-coder) and
// one enumerator per pair — enforced in the query layer and tested; the
// membership history itself lives here.
export const pairMembers = pgTable("pair_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  pairId: uuid("pair_id")
    .notNull()
    .references(() => pairs.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  joinedAt: timestamp("joined_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
});

/* ------------------------------------------------------------------ */
/* §4.2 Videos and provenance                                          */
/* ------------------------------------------------------------------ */

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Opaque display code (V-0417), assigned from a seeded shuffle at import.
  displayCode: text("display_code").notNull().unique(),
  driveUrl: text("drive_url"),
  durationSeconds: integer("duration_seconds"),
  dataset: datasetEnum("dataset").notNull().default("live"),
  status: videoStatusEnum("status").notNull().default("pool"),
  // Never serialized to coders (§3 blinding test asserts this).
  isGold: boolean("is_gold").notNull().default(false),
  unusableReason: text("unusable_reason"),
  unusableFlaggedBy: uuid("unusable_flagged_by").references(() => users.id),
  unusableFlaggedAt: timestamp("unusable_flagged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ADMIN-ONLY (§3). The only table that knows school, arm, or teacher.
// This is the display-code ↔ true-ID crosswalk (Amendment B §6).
export const videoProvenance = pgTable("video_provenance", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id")
    .notNull()
    .unique()
    .references(() => videos.id),
  rawFilename: text("raw_filename").notNull(),
  sid: text("sid").notNull(), // school ID, e.g. 11002
  trId: text("tr_id").notNull(), // teacher ID, e.g. 11002_29
  // Nullable: school 22103 has no arm anywhere in the mapping file; its rows
  // import with NULL for the admin to resolve before assignment.
  arm: armEnum("arm"),
  teacherAssignment: text("teacher_assignment"),
  subject: text("subject"),
  recordedYear: integer("recorded_year"),
  // Amendment B §11: (-666)/NO_TEACHER rows and language-subject lessons.
  excluded: boolean("excluded").notNull().default(false),
  excludedReason: text("excluded_reason"),
  importBatch: text("import_batch"),
  importedAt: timestamp("imported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* §4.3 Assignment                                                     */
/* ------------------------------------------------------------------ */

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id),
  pairId: uuid("pair_id")
    .notNull()
    .references(() => pairs.id),
  waveNo: integer("wave_no").notNull(),
  dataset: datasetEnum("dataset").notNull().default("live"),
  priorityBatchFlag: boolean("priority_batch_flag").notNull().default(false),
  // e.g. 'recode-2026' for the admin recode set (Amendment B §7).
  batchLabel: text("batch_label"),
  status: assignmentStatusEnum("status").notNull().default("active"),
  statusReason: text("status_reason"),
  assignedAt: timestamp("assigned_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  assignedBy: uuid("assigned_by").references(() => users.id),
});

export const assignmentRaters = pgTable(
  "assignment_raters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    fillsContextCard: boolean("fills_context_card").notNull().default(false),
    // Admin recoding a video they coded under the old rubric (Amendment B §7).
    previouslyCoded: boolean("previously_coded").notNull().default(false),
    status: raterStatusEnum("status").notNull().default("active"),
    statusReason: text("status_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Amendment A: exactly one card-filler per assignment.
    uniqueIndex("one_card_filler_per_assignment")
      .on(t.assignmentId)
      .where(sql`${t.fillsContextCard} = true`),
    uniqueIndex("one_rater_row_per_user_per_assignment").on(
      t.assignmentId,
      t.userId,
    ),
  ],
);

// APPEND-ONLY. This table IS the clobs_assignments export (§4.3).
export const assignmentLog = pgTable("assignment_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: assignmentActionEnum("action").notNull(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id),
  fromPairId: uuid("from_pair_id").references(() => pairs.id),
  toPairId: uuid("to_pair_id").references(() => pairs.id),
  fromUserId: uuid("from_user_id").references(() => users.id),
  toUserId: uuid("to_user_id").references(() => users.id),
  fillsContextCard: boolean("fills_context_card"),
  seed: text("seed"),
  algorithmVersion: text("algorithm_version"),
  waveNo: integer("wave_no"),
  reason: text("reason"),
  actorId: uuid("actor_id").references(() => users.id),
  dataset: datasetEnum("dataset").notNull().default("live"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* §4.4 The observation (one coder × one video)                        */
/* ------------------------------------------------------------------ */

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id),
    coderId: uuid("coder_id")
      .notNull()
      .references(() => users.id),
    assignmentRaterId: uuid("assignment_rater_id").references(
      () => assignmentRaters.id,
    ),
    dataset: datasetEnum("dataset").notNull().default("live"),
    status: observationStatusEnum("status").notNull().default("not_started"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    nSessions: integer("n_sessions"),
    rubricVersionId: uuid("rubric_version_id").references(
      () => rubricVersions.id,
    ),
    // Drift re-checks (§4.7); admin-only in serialization, like is_gold.
    isSeededRecheck: boolean("is_seeded_recheck").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("one_observation_per_coder_video").on(t.videoId, t.coderId)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.id),
    // Nullable: the free-text path exists, timestamped entry is the default (§5).
    videoTimestampSeconds: integer("video_timestamp_seconds"),
    body: text("body").notNull(),
    dataset: datasetEnum("dataset").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("notes_by_observation").on(t.observationId)],
);

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.id),
    itemNo: integer("item_no").notNull(), // 1–8
    scoreNum: integer("score_num").notNull(), // 1–4
    scoreColumn: scoreColumnEnum("score_column").notNull(),
    scoreDegree: scoreDegreeEnum("score_degree").notNull(),
    justification: text("justification"),
    rubricVersionId: uuid("rubric_version_id")
      .notNull()
      .references(() => rubricVersions.id),
    dataset: datasetEnum("dataset").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    // Set on observation submission; any later UPDATE is refused (CLAUDE.md §6).
    lockedAt: timestamp("locked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("one_score_per_item_per_observation").on(
      t.observationId,
      t.itemNo,
    ),
    check("item_no_range", sql`${t.itemNo} BETWEEN 1 AND 8`),
    check(
      "score_encoding_fixed",
      scoreTripleCheck("score_num", "score_column", "score_degree"),
    ),
  ],
);

// Optional, never required or prompted (Amendment B §4).
export const scoreNoteCitations = pgTable(
  "score_note_citations",
  {
    scoreId: uuid("score_id")
      .notNull()
      .references(() => scores.id),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id),
  },
  (t) => [primaryKey({ columns: [t.scoreId, t.noteId] })],
);

// The reach-scale counting tool (addendum §4).
export const pupilTallies = pgTable("pupil_tallies", {
  id: uuid("id").primaryKey().defaultRandom(),
  observationId: uuid("observation_id")
    .notNull()
    .references(() => observations.id),
  label: text("label").notNull(),
  count: integer("count").notNull().default(0),
  dataset: datasetEnum("dataset").notNull().default("live"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* §4.5 Context card — one per video, no scenes (Amendments A + B)     */
/* ------------------------------------------------------------------ */

export const contextCards = pgTable("context_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id")
    .notNull()
    .unique()
    .references(() => videos.id),
  authoredBy: uuid("authored_by")
    .notNull()
    .references(() => users.id),
  dataset: datasetEnum("dataset").notNull().default("live"),
  status: cardStatusEnum("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  // General fields, once per video (Amendment B §1).
  subject: text("subject"),
  composition: compositionEnum("composition"),
  approxCount: text("approx_count"), // a number, a range, or 'unknown'
  uniforms: text("uniforms"),
  appearanceCaveats: text("appearance_caveats"),
  room: text("room"),
  camera: text("camera"),
  notes: text("notes"),
  timeline: text("timeline"),
  // Rare mid-recording setting change; replaces the pilot's scene rows.
  settingChange: text("setting_change"),
  // The confirm/flag second pass (Amendment A, adopted).
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  flagged: boolean("flagged").notNull().default(false),
  flagReason: text("flag_reason"),
  flagResolvedBy: uuid("flag_resolved_by").references(() => users.id),
  flagResolvedAt: timestamp("flag_resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contextAdults = pgTable(
  "context_adults",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contextCardId: uuid("context_card_id")
      .notNull()
      .references(() => contextCards.id),
    adultNo: integer("adult_no").notNull(), // 1–6
    role: adultRoleEnum("role"),
    sex: sexEnum("sex"),
    clothing: text("clothing"),
    clothingCaveats: text("clothing_caveats"),
    features: text("features"),
    behavior: text("behavior"),
    speaks: speaksEnum("speaks"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("one_adult_no_per_card").on(t.contextCardId, t.adultNo),
    check("adult_no_range", sql`${t.adultNo} BETWEEN 1 AND 6`),
  ],
);

// Field-level instructions from context_cards_v3, rendered as inline help.
export const fieldHelp = pgTable("field_help", {
  id: uuid("id").primaryKey().defaultRandom(),
  form: text("form").notNull(), // 'context_card'
  fieldKey: text("field_key").notNull(),
  helpText: text("help_text").notNull(),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
});

/* ------------------------------------------------------------------ */
/* §4.6 Calibration                                                    */
/* ------------------------------------------------------------------ */

export const calibrationSessions = pgTable("calibration_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id),
  pairId: uuid("pair_id")
    .notNull()
    .references(() => pairs.id),
  dataset: datasetEnum("dataset").notNull().default("live"),
  // Moves to 'open' only when both coders have an active presence row —
  // the server-side gate the blinding tests exercise (§4.6).
  status: calibrationStatusEnum("status").notNull().default("scheduled"),
  rubricVersionId: uuid("rubric_version_id").references(() => rubricVersions.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  voidedReason: text("voided_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const calibrationPresence = pgTable("calibration_presence", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => calibrationSessions.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  joinedAt: timestamp("joined_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
});

// No escalation path (Amendment B §3): consensus per item is mandatory.
export const calibrationItems = pgTable(
  "calibration_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => calibrationSessions.id),
    itemNo: integer("item_no").notNull(),
    coderAScoreId: uuid("coder_a_score_id")
      .notNull()
      .references(() => scores.id),
    coderBScoreId: uuid("coder_b_score_id")
      .notNull()
      .references(() => scores.id),
    finalScoreNum: integer("final_score_num").notNull(),
    finalScoreColumn: scoreColumnEnum("final_score_column").notNull(),
    finalScoreDegree: scoreDegreeEnum("final_score_degree").notNull(),
    resolution: resolutionEnum("resolution").notNull(),
    // Required when the two individual scores differed (Amendment B §3).
    consensusRationale: text("consensus_rationale"),
    dataset: datasetEnum("dataset").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("one_item_per_session").on(t.sessionId, t.itemNo),
    check("cal_item_no_range", sql`${t.itemNo} BETWEEN 1 AND 8`),
    check(
      "final_score_encoding_fixed",
      scoreTripleCheck(
        "final_score_num",
        "final_score_column",
        "final_score_degree",
      ),
    ),
  ],
);

export const calibrationSignoffs = pgTable(
  "calibration_signoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => calibrationSessions.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (t) => [uniqueIndex("one_signoff_per_user_per_session").on(t.sessionId, t.userId)],
);

/* ------------------------------------------------------------------ */
/* §4.7 Gold standard and certification                                */
/* ------------------------------------------------------------------ */

// ADMIN-ONLY: master scores. Reaching this table from a coder route is a
// blinding failure by definition (§3).
export const goldScores = pgTable(
  "gold_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id),
    itemNo: integer("item_no").notNull(),
    scoreNum: integer("score_num").notNull(),
    scoreColumn: scoreColumnEnum("score_column").notNull(),
    scoreDegree: scoreDegreeEnum("score_degree").notNull(),
    rationale: text("rationale"),
    rubricVersionId: uuid("rubric_version_id")
      .notNull()
      .references(() => rubricVersions.id),
    enteredBy: uuid("entered_by")
      .notNull()
      .references(() => users.id),
    enteredAt: timestamp("entered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("one_gold_score_per_item").on(t.videoId, t.itemNo),
    check("gold_item_no_range", sql`${t.itemNo} BETWEEN 1 AND 8`),
    check(
      "gold_score_encoding_fixed",
      scoreTripleCheck("score_num", "score_column", "score_degree"),
    ),
  ],
);

export const certifications = pgTable("certifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  attemptNo: integer("attempt_no").notNull().default(1),
  status: certificationStatusEnum("status").notNull().default("in_progress"),
  thresholdSpec: jsonb("threshold_spec"),
  resultStats: jsonb("result_stats"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* §4.8 Instrument — rubric as data, versioned                         */
/* ------------------------------------------------------------------ */

export const rubricVersions = pgTable("rubric_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionLabel: text("version_label").notNull().unique(), // e.g. '2026-08-22'
  sourceRef: text("source_ref"), // the .tex commit
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rubricConcepts = pgTable(
  "rubric_concepts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rubricVersionId: uuid("rubric_version_id")
      .notNull()
      .references(() => rubricVersions.id),
    itemNo: integer("item_no").notNull(),
    name: text("name").notNull(),
    statement: text("statement").notNull(),
    importance: text("importance").notNull(),
    specialNote: text("special_note").notNull(),
  },
  (t) => [
    uniqueIndex("one_concept_per_item_per_version").on(
      t.rubricVersionId,
      t.itemNo,
    ),
    check("concept_item_no_range", sql`${t.itemNo} BETWEEN 1 AND 8`),
  ],
);

export const rubricIndicators = pgTable("rubric_indicators", {
  id: uuid("id").primaryKey().defaultRandom(),
  conceptId: uuid("concept_id")
    .notNull()
    .references(() => rubricConcepts.id),
  position: integer("position").notNull(),
  text: text("text").notNull(),
});

export const rubricAnchors = pgTable(
  "rubric_anchors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => rubricConcepts.id),
    scoreNum: integer("score_num").notNull(), // 1–4
    text: text("text").notNull(),
  },
  (t) => [
    uniqueIndex("one_anchor_per_score").on(t.conceptId, t.scoreNum),
    check("anchor_score_range", sql`${t.scoreNum} BETWEEN 1 AND 4`),
  ],
);

export const rubricExamples = pgTable("rubric_examples", {
  id: uuid("id").primaryKey().defaultRandom(),
  conceptId: uuid("concept_id")
    .notNull()
    .references(() => rubricConcepts.id),
  scoreNum: integer("score_num").notNull(),
  position: integer("position").notNull(),
  text: text("text").notNull(),
});

// Front-matter guiding rules + the shared four-band reach scale (§4.8).
export const rubricGuidance = pgTable("rubric_guidance", {
  id: uuid("id").primaryKey().defaultRandom(),
  rubricVersionId: uuid("rubric_version_id")
    .notNull()
    .references(() => rubricVersions.id),
  kind: guidanceKindEnum("kind").notNull(),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  text: text("text").notNull(),
});

/* ------------------------------------------------------------------ */
/* §4.9 Instrumentation, audit, exports (append-only)                  */
/* ------------------------------------------------------------------ */

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    dataset: datasetEnum("dataset").notNull().default("live"),
    videoId: uuid("video_id").references(() => videos.id),
    observationId: uuid("observation_id").references(() => observations.id),
    sessionId: uuid("session_id").references(() => calibrationSessions.id),
    kind: text("kind").notNull(),
    payload: jsonb("payload"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("events_by_time").on(t.occurredAt)],
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  subjectTable: text("subject_table"),
  subjectId: text("subject_id"),
  details: jsonb("details"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const exports = pgTable("exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => users.id),
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  rubricVersionId: uuid("rubric_version_id").references(() => rubricVersions.id),
  rowCounts: jsonb("row_counts"),
  manifest: jsonb("manifest"),
  driveFileIds: jsonb("drive_file_ids"),
});
