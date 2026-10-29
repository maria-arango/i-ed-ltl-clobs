/**
 * Minimal CSV reader for the admin's assignment sheet (the shape of
 * 00_assignments.csv). Handles quoted fields, doubled quotes, CRLF and a
 * UTF-8 BOM; nothing more is needed for a sheet exported from Google Sheets.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** CSV rows as objects keyed by lower-cased, trimmed header names. */
export function csvObjects(text: string): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/**
 * A video link from the sheet: a full https URL, or a bare Google Drive
 * file id (the sheet's `video_drive_id` column) turned into a Drive link.
 */
export function normaliseVideoLink(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^[A-Za-z0-9_-]{20,}$/.test(v)) return `https://drive.google.com/file/d/${v}/view`;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
