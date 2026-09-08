/**
 * The data dictionary as a flat table (Amendment §42): one row per export
 * column, generated from the contract so it can never drift from the
 * files. Shipped as data_dictionary.csv in every export and rendered on
 * the Exports screen. Pure.
 */
import { EXPORT_TABLES, type ExportRow, type ExportTable } from "./contract";

export const DICTIONARY: ExportTable = {
  name: "data_dictionary",
  unit: "one row per column of every export table",
  description: "What each column in the export means, generated from the same contract that writes the files.",
  columns: [
    { name: "table_name", type: "str", label: "Export table" },
    { name: "position", type: "int", label: "Column position (1-based)" },
    { name: "column_name", type: "str", label: "Column name" },
    { name: "type", type: "str", label: "Type: str, int, float, bool, datetime" },
    { name: "label", type: "str", label: "Short label (Stata variable label)" },
    { name: "description", type: "str", label: "Longer explanation", long: true },
    { name: "codes", type: "str", label: "Stata integer codes for categorical text (code=text; …)" },
    { name: "value_labels", type: "str", label: "Value labels for integer columns (value=label; …)" },
    { name: "unblinded", type: "bool", label: "Reveals school / arm / teacher / filename" },
    { name: "long_text", type: "bool", label: "Free text, strL in Stata" },
    { name: "table_unit", type: "str", label: "What one row of the table is" },
  ],
};

export function dictionaryRows(tables: readonly ExportTable[] = EXPORT_TABLES): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const t of tables) {
    t.columns.forEach((c, i) => {
      rows.push({
        table_name: t.name,
        position: i + 1,
        column_name: c.name,
        type: c.type,
        label: c.label,
        description: c.description ?? null,
        codes: c.codes ? Object.entries(c.codes).map(([k, v]) => `${v}=${k}`).join("; ") : null,
        value_labels: c.valueLabels ? Object.entries(c.valueLabels).map(([k, v]) => `${k}=${v}`).join("; ") : null,
        unblinded: !!c.unblinded,
        long_text: !!c.long,
        table_unit: t.unit,
      });
    });
  }
  return rows;
}
