/**
 * The codebook — generated from the contract and the rubric version, in
 * two forms: machine-readable JSON and human-readable Markdown. Both are
 * stored with every export so a dataset is never separated from its
 * documentation (addendum §12). Pure.
 */
import { EXPORT_TABLES, SCORE_VALUE_LABELS, type ExportTable } from "./contract";

export interface CodebookInput {
  exportId: string;
  generatedAt: Date;
  rubricVersion: string | null;
  /** item_no → concept name, from the rubric version. */
  items: Record<number, string>;
  rowCounts: Record<string, number>;
  requestedBy: string;
  platformVersion: string;
}

export interface CodebookJson {
  export_id: string;
  generated_at: string;
  requested_by: string;
  platform_version: string;
  rubric_version: string | null;
  dataset: "live";
  score_encoding: Record<number, string>;
  rubric_items: Array<{ item_no: number; item_name: string }>;
  formats: { csv: string; dta: string };
  formulas: Record<string, string>;
  tables: Array<{
    name: string;
    unit: string;
    description: string;
    row_count: number;
    files: string[];
    columns: Array<{
      name: string;
      type: string;
      label: string;
      description?: string;
      codes?: Record<string, number>;
      value_labels?: Record<number, string>;
      unblinded?: boolean;
      long_text?: boolean;
    }>;
  }>;
}

const FORMULAS: Record<string, string> = {
  minutes_on_item:
    "For each observation, order its events by time. Each gap between consecutive events is attributed to the rubric item of the EARLIER event when that event carries an item (score_selected, score_changed); gaps over 30 minutes are dropped as idle; gaps after an event with no item are not attributed. Sum per item, in minutes. Empty when the observation has no item events.",
  n_sessions:
    "Number of distinct coding sessions the observation was completed across (resume count), as recorded on the observation.",
  cited_timestamps:
    "The video_timestamp_seconds of every note the coder cited for that score, ';'-joined, ascending. Citations are optional and usually absent (Amendment B §4).",
  body_text:
    "HTML tags removed, block elements separated by newlines, entities decoded. The HTML column is the stored original.",
};

export function buildCodebookJson(input: CodebookInput, tables: readonly ExportTable[] = EXPORT_TABLES): CodebookJson {
  return {
    export_id: input.exportId,
    generated_at: input.generatedAt.toISOString(),
    requested_by: input.requestedBy,
    platform_version: input.platformVersion,
    rubric_version: input.rubricVersion,
    dataset: "live",
    score_encoding: SCORE_VALUE_LABELS,
    rubric_items: Object.entries(input.items)
      .map(([k, v]) => ({ item_no: Number(k), item_name: v }))
      .sort((a, b) => a.item_no - b.item_no),
    formats: {
      csv: "UTF-8, RFC 4180, CRLF, header row; booleans 1/0; datetimes ISO 8601 UTC; categorical columns as text.",
      dta: "Stata format 118 (Stata 14+); variable labels applied; categorical text columns stored as labelled integers using the codes listed per column; booleans as labelled 0/1; datetimes as %tc; long text as strL.",
    },
    formulas: FORMULAS,
    tables: tables.map((t) => ({
      name: t.name,
      unit: t.unit,
      description: t.description,
      row_count: input.rowCounts[t.name] ?? 0,
      files: [`${t.name}.csv`, `${t.name}.dta`],
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.type,
        label: c.label,
        ...(c.description ? { description: c.description } : {}),
        ...(c.codes ? { codes: c.codes } : {}),
        ...(c.valueLabels ? { value_labels: c.valueLabels } : {}),
        ...(c.unblinded ? { unblinded: true } : {}),
        ...(c.long ? { long_text: true } : {}),
      })),
    })),
  };
}

function mdEscape(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function buildCodebookMarkdown(input: CodebookInput, tables: readonly ExportTable[] = EXPORT_TABLES): string {
  const lines: string[] = [];
  lines.push(`# CLOBS export codebook`);
  lines.push("");
  lines.push(`- Export id: \`${input.exportId}\``);
  lines.push(`- Generated: ${input.generatedAt.toISOString()}`);
  lines.push(`- Requested by: ${input.requestedBy}`);
  lines.push(`- Platform version: ${input.platformVersion}`);
  lines.push(`- Rubric version: ${input.rubricVersion ?? "(none recorded)"}`);
  lines.push(`- Dataset: live only. Test and training rows are excluded by the shared query layer.`);
  lines.push("");
  lines.push(`## Score encoding (fixed)`);
  lines.push("");
  for (const [k, v] of Object.entries(SCORE_VALUE_LABELS)) lines.push(`- ${k} = ${v}`);
  lines.push("");
  lines.push(`## Rubric items`);
  lines.push("");
  for (const [k, v] of Object.entries(input.items).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    lines.push(`- ${k}. ${v}`);
  }
  lines.push("");
  lines.push(`## Formats`);
  lines.push("");
  lines.push(`- CSV: UTF-8, RFC 4180, CRLF, header row. Booleans 1/0. Datetimes ISO 8601 (UTC). Categorical columns as text.`);
  lines.push(`- Stata .dta: format 118 (Stata 14+). Variable labels applied. Categorical text columns are stored as labelled integers (codes listed per column). Booleans are labelled 0/1. Datetimes are %tc. Long text is strL.`);
  lines.push("");
  lines.push(`## Derived columns`);
  lines.push("");
  for (const [k, v] of Object.entries(FORMULAS)) lines.push(`- **${k}**: ${v}`);
  lines.push("");
  lines.push(`## Row counts`);
  lines.push("");
  lines.push(`| Table | Rows |`);
  lines.push(`|---|---:|`);
  for (const t of tables) lines.push(`| ${t.name} | ${input.rowCounts[t.name] ?? 0} |`);
  lines.push("");
  for (const t of tables) {
    lines.push(`## ${t.name}`);
    lines.push("");
    lines.push(`Unit: ${t.unit}.`);
    lines.push("");
    lines.push(t.description);
    lines.push("");
    lines.push(`Files: \`${t.name}.csv\`, \`${t.name}.dta\`. Rows: ${input.rowCounts[t.name] ?? 0}.`);
    lines.push("");
    lines.push(`| # | Column | Type | Label | Notes |`);
    lines.push(`|--:|---|---|---|---|`);
    t.columns.forEach((c, i) => {
      const notes: string[] = [];
      if (c.unblinded) notes.push("UNBLINDED");
      if (c.long) notes.push("long text (strL in .dta)");
      if (c.codes) notes.push(`codes: ${Object.entries(c.codes).map(([k, v]) => `${v}=${k}`).join(", ")}`);
      if (c.valueLabels) notes.push(`labels: ${Object.entries(c.valueLabels).map(([k, v]) => `${k}=${v}`).join(", ")}`);
      if (c.description) notes.push(c.description);
      lines.push(`| ${i + 1} | \`${c.name}\` | ${c.type} | ${mdEscape(c.label)} | ${mdEscape(notes.join(" · "))} |`);
    });
    lines.push("");
  }
  return lines.join("\n");
}
