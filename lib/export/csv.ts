/**
 * CSV writer (RFC 4180): UTF-8, no BOM, CRLF line endings, every field
 * quoted when it contains a comma, quote, CR or LF. Header = the contract's
 * column names in order. Booleans are 1/0, datetimes ISO 8601 in UTC,
 * nulls are empty fields. Pure — no database, no filesystem.
 */
import type { ExportColumn, ExportRow, ExportTable } from "./contract";

export function formatCsvValue(
  value: ExportRow[string],
  column: ExportColumn,
): string {
  if (value === null || value === undefined) return "";
  switch (column.type) {
    case "bool":
      return value ? "1" : "0";
    case "datetime":
      return value instanceof Date ? value.toISOString() : String(value);
    case "int":
    case "float":
      return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    default:
      return String(value);
  }
}

function escapeField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(table: ExportTable, rows: ExportRow[]): string {
  const header = table.columns.map((c) => escapeField(c.name)).join(",");
  const lines = rows.map((row) =>
    table.columns
      .map((c) => escapeField(formatCsvValue(row[c.name] ?? null, c)))
      .join(","),
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}
