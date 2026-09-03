/**
 * Stata .dta writer — format 118 (Stata 14+), little-endian, UTF-8.
 * Variable labels, value labels, and strL for long text. Written from the
 * public format specification (help dta); the test parses the header and
 * the variable/label sections back and asserts they match the contract.
 *
 * Type mapping from the contract:
 *   int (with value labels)  → long, %8.0g, value label applied
 *   float                    → double, %10.0g
 *   bool                     → byte, %8.0g, value label yes/no
 *   datetime                 → double %tc (milliseconds since 1960-01-01)
 *   str with `codes`         → long with the code table as value label
 *   str (short)              → str# sized to the longest value (≤ 2045)
 *   str (`long`, or > 2045)  → strL
 * Missing = Stata's system missing (".") or the empty string.
 */
import type { ExportColumn, ExportRow, ExportTable } from "./contract";

const STATA_EPOCH_MS = Date.UTC(1960, 0, 1);
const TYPE_STRL = 32768;
const TYPE_DOUBLE = 65526;
const TYPE_LONG = 65528;
const TYPE_BYTE = 65530;
const MISSING_BYTE = 101;
const MISSING_LONG = 2147483621;
const MAX_STR = 2045;

const enc = new TextEncoder();

type Plan =
  | { kind: "byte" | "long" | "double" | "strl" }
  | { kind: "str"; width: number };

interface VarPlan {
  column: ExportColumn;
  plan: Plan;
  /** Value-label name (≤ 32 chars) if any. */
  labelName: string | null;
  /** Code table: integer → text. */
  valueLabels: Record<number, string> | null;
}

function utf8Bytes(s: string): Uint8Array {
  return enc.encode(s);
}

function planColumn(column: ExportColumn, rows: ExportRow[]): VarPlan {
  const labelName = column.codes || column.valueLabels || column.type === "bool"
    ? `lb_${column.name}`.slice(0, 32)
    : null;
  if (column.type === "bool") {
    return { column, plan: { kind: "byte" }, labelName, valueLabels: { 0: "no", 1: "yes" } };
  }
  if (column.type === "int") {
    return { column, plan: { kind: "long" }, labelName, valueLabels: column.valueLabels ?? null };
  }
  if (column.type === "float" || column.type === "datetime") {
    return { column, plan: { kind: "double" }, labelName: null, valueLabels: null };
  }
  if (column.codes) {
    const inverted: Record<number, string> = {};
    for (const [text, code] of Object.entries(column.codes)) inverted[code] = text;
    return { column, plan: { kind: "long" }, labelName, valueLabels: inverted };
  }
  if (column.long) return { column, plan: { kind: "strl" }, labelName: null, valueLabels: null };
  let width = 1;
  for (const r of rows) {
    const v = r[column.name];
    if (v === null || v === undefined) continue;
    const n = utf8Bytes(String(v)).length;
    if (n > width) width = n;
    if (width > MAX_STR) break;
  }
  if (width > MAX_STR) return { column, plan: { kind: "strl" }, labelName: null, valueLabels: null };
  return { column, plan: { kind: "str", width }, labelName: null, valueLabels: null };
}

function typeCode(p: Plan): number {
  switch (p.kind) {
    case "byte":
      return TYPE_BYTE;
    case "long":
      return TYPE_LONG;
    case "double":
      return TYPE_DOUBLE;
    case "strl":
      return TYPE_STRL;
    case "str":
      return p.width;
  }
}

function formatOf(v: VarPlan): string {
  if (v.column.type === "datetime") return "%tc";
  switch (v.plan.kind) {
    case "byte":
    case "long":
      return "%8.0g";
    case "double":
      return "%10.0g";
    case "strl":
      return "%9s";
    case "str":
      return `%${v.plan.width}s`;
  }
}

/** A growable little-endian byte buffer. */
class ByteWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;
  get size() {
    return this.length;
  }
  bytes(b: Uint8Array) {
    this.chunks.push(b);
    this.length += b.length;
  }
  ascii(s: string) {
    this.bytes(utf8Bytes(s));
  }
  /** Fixed-width field, UTF-8, zero-padded / truncated at a char boundary. */
  fixed(s: string, width: number) {
    const out = new Uint8Array(width);
    let b = utf8Bytes(s);
    if (b.length > width) {
      // truncate to whole characters
      let cut = width;
      while (cut > 0 && (b[cut] & 0xc0) === 0x80) cut--;
      b = b.slice(0, cut);
    }
    out.set(b);
    this.bytes(out);
  }
  u8(n: number) {
    this.bytes(new Uint8Array([n & 0xff]));
  }
  i8(n: number) {
    const a = new Uint8Array(1);
    new DataView(a.buffer).setInt8(0, n);
    this.bytes(a);
  }
  u16(n: number) {
    const a = new Uint8Array(2);
    new DataView(a.buffer).setUint16(0, n, true);
    this.bytes(a);
  }
  i16(n: number) {
    const a = new Uint8Array(2);
    new DataView(a.buffer).setInt16(0, n, true);
    this.bytes(a);
  }
  u32(n: number) {
    const a = new Uint8Array(4);
    new DataView(a.buffer).setUint32(0, n >>> 0, true);
    this.bytes(a);
  }
  i32(n: number) {
    const a = new Uint8Array(4);
    new DataView(a.buffer).setInt32(0, n, true);
    this.bytes(a);
  }
  u64(n: number | bigint) {
    const a = new Uint8Array(8);
    new DataView(a.buffer).setBigUint64(0, BigInt(n), true);
    this.bytes(a);
  }
  f64(n: number) {
    const a = new Uint8Array(8);
    new DataView(a.buffer).setFloat64(0, n, true);
    this.bytes(a);
  }
  /** Stata's system-missing double (".") */
  missingDouble() {
    const a = new Uint8Array(8);
    new DataView(a.buffer).setBigUint64(0, BigInt("0x7fe0000000000000"), true);
    this.bytes(a);
  }
  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

function stataTimestamp(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${hh}:${mm}`; // 17 chars
}

export interface DtaOptions {
  /** Dataset label (≤ 80 chars). */
  label?: string;
  /** Fixed timestamp for reproducible bytes in tests. */
  now?: Date;
}

export function toDta(table: ExportTable, rows: ExportRow[], opts: DtaOptions = {}): Uint8Array {
  const vars = table.columns.map((c) => planColumn(c, rows));
  const K = vars.length;
  const N = rows.length;
  const now = opts.now ?? new Date();
  const w = new ByteWriter();
  const offsets: number[] = new Array(14).fill(0);

  // ---- header
  w.ascii("<stata_dta><header><release>118</release><byteorder>LSF</byteorder><K>");
  w.u16(K);
  w.ascii("</K><N>");
  w.u64(N);
  w.ascii("</N><label>");
  const label = utf8Bytes((opts.label ?? table.name).slice(0, 80));
  w.u16(label.length);
  w.bytes(label);
  w.ascii("</label><timestamp>");
  w.u8(17);
  w.ascii(stataTimestamp(now));
  w.ascii("</timestamp></header>");

  // ---- map (filled in at the end)
  offsets[1] = w.size;
  const mapPos = w.size;
  w.ascii("<map>");
  for (let i = 0; i < 14; i++) w.u64(0);
  w.ascii("</map>");

  offsets[2] = w.size;
  w.ascii("<variable_types>");
  for (const v of vars) w.u16(typeCode(v.plan));
  w.ascii("</variable_types>");

  offsets[3] = w.size;
  w.ascii("<varnames>");
  for (const v of vars) w.fixed(v.column.name, 129);
  w.ascii("</varnames>");

  offsets[4] = w.size;
  w.ascii("<sortlist>");
  for (let i = 0; i < K + 1; i++) w.u16(0);
  w.ascii("</sortlist>");

  offsets[5] = w.size;
  w.ascii("<formats>");
  for (const v of vars) w.fixed(formatOf(v), 57);
  w.ascii("</formats>");

  offsets[6] = w.size;
  w.ascii("<value_label_names>");
  for (const v of vars) w.fixed(v.labelName ?? "", 129);
  w.ascii("</value_label_names>");

  offsets[7] = w.size;
  w.ascii("<variable_labels>");
  for (const v of vars) w.fixed(v.column.label, 321);
  w.ascii("</variable_labels>");

  offsets[8] = w.size;
  w.ascii("<characteristics></characteristics>");

  // ---- data
  offsets[9] = w.size;
  w.ascii("<data>");
  const strls: Array<{ v: number; o: number; text: string }> = [];
  for (let o = 0; o < N; o++) {
    const row = rows[o];
    for (let vi = 0; vi < K; vi++) {
      const v = vars[vi];
      const raw = row[v.column.name];
      const isMissing = raw === null || raw === undefined || raw === "";
      switch (v.plan.kind) {
        case "byte":
          w.i8(isMissing ? MISSING_BYTE : raw ? 1 : 0);
          break;
        case "long": {
          if (isMissing) {
            w.i32(MISSING_LONG);
          } else if (v.column.codes) {
            const code = v.column.codes[String(raw)];
            w.i32(code === undefined ? MISSING_LONG : code);
          } else {
            const n = Number(raw);
            w.i32(Number.isFinite(n) ? Math.trunc(n) : MISSING_LONG);
          }
          break;
        }
        case "double": {
          if (isMissing) {
            w.missingDouble();
          } else if (v.column.type === "datetime") {
            const ms = raw instanceof Date ? raw.getTime() : new Date(String(raw)).getTime();
            if (Number.isFinite(ms)) w.f64(ms - STATA_EPOCH_MS);
            else w.missingDouble();
          } else {
            const n = Number(raw);
            if (Number.isFinite(n)) w.f64(n);
            else w.missingDouble();
          }
          break;
        }
        case "str":
          w.fixed(isMissing ? "" : String(raw), v.plan.width);
          break;
        case "strl": {
          if (isMissing) {
            w.u64(0); // (v=0, o=0) = empty string
          } else {
            // 118: v in 2 bytes, o in 6 bytes, both 1-based
            w.u16(vi + 1);
            const ob = new Uint8Array(6);
            let n = o + 1;
            for (let i = 0; i < 6; i++) {
              ob[i] = n & 0xff;
              n = Math.floor(n / 256);
            }
            w.bytes(ob);
            strls.push({ v: vi + 1, o: o + 1, text: String(raw) });
          }
          break;
        }
      }
    }
  }
  w.ascii("</data>");

  // ---- strls
  offsets[10] = w.size;
  w.ascii("<strls>");
  for (const s of strls) {
    const body = utf8Bytes(s.text);
    w.ascii("GSO");
    w.u32(s.v);
    w.u64(s.o);
    w.u8(130); // UTF-8 text, null-terminated
    w.u32(body.length + 1);
    w.bytes(body);
    w.u8(0);
  }
  w.ascii("</strls>");

  // ---- value labels
  offsets[11] = w.size;
  w.ascii("<value_labels>");
  for (const v of vars) {
    if (!v.labelName || !v.valueLabels) continue;
    const entries = Object.entries(v.valueLabels)
      .map(([k, text]) => ({ value: Number(k), text }))
      .sort((a, b) => a.value - b.value);
    const texts = entries.map((e) => utf8Bytes(e.text));
    const n = entries.length;
    const txtlen = texts.reduce((s, t) => s + t.length + 1, 0);
    const tableLen = 4 + 4 + 4 * n + 4 * n + txtlen;
    w.ascii("<lbl>");
    w.u32(tableLen);
    w.fixed(v.labelName, 129);
    w.bytes(new Uint8Array(3)); // padding
    w.u32(n);
    w.u32(txtlen);
    let off = 0;
    for (const t of texts) {
      w.u32(off);
      off += t.length + 1;
    }
    for (const e of entries) w.i32(e.value);
    for (const t of texts) {
      w.bytes(t);
      w.u8(0);
    }
    w.ascii("</lbl>");
  }
  w.ascii("</value_labels>");

  offsets[12] = w.size;
  w.ascii("</stata_dta>");
  offsets[13] = w.size;

  const out = w.concat();
  // Patch the map: 14 offsets after "<map>".
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const start = mapPos + "<map>".length;
  for (let i = 0; i < 14; i++) view.setBigUint64(start + i * 8, BigInt(offsets[i]), true);
  return out;
}

/* ------------------------------------------------------------------ */
/* Minimal reader of the parts the contract test needs (names, labels,  */
/* types, N, K, value-label names). Not a general .dta reader.          */
/* ------------------------------------------------------------------ */

export interface DtaSummary {
  release: number;
  K: number;
  N: number;
  varnames: string[];
  variableLabels: string[];
  valueLabelNames: string[];
  types: number[];
  formats: string[];
  valueLabels: Record<string, Record<number, string>>;
}

export function readDtaSummary(bytes: Uint8Array): DtaSummary {
  const dec = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const find = (marker: string, from = 0) => {
    const m = utf8Bytes(marker);
    outer: for (let i = from; i <= bytes.length - m.length; i++) {
      for (let j = 0; j < m.length; j++) if (bytes[i + j] !== m[j]) continue outer;
      return i;
    }
    return -1;
  };
  const cstr = (at: number, width: number) => {
    let end = at;
    while (end < at + width && bytes[end] !== 0) end++;
    return dec.decode(bytes.slice(at, end));
  };
  const relAt = find("<release>") + "<release>".length;
  const release = Number(dec.decode(bytes.slice(relAt, relAt + 3)));
  const kAt = find("<K>") + 3;
  const K = view.getUint16(kAt, true);
  const nAt = find("<N>") + 3;
  const N = Number(view.getBigUint64(nAt, true));

  const typesAt = find("<variable_types>") + "<variable_types>".length;
  const types: number[] = [];
  for (let i = 0; i < K; i++) types.push(view.getUint16(typesAt + i * 2, true));

  const namesAt = find("<varnames>") + "<varnames>".length;
  const varnames: string[] = [];
  for (let i = 0; i < K; i++) varnames.push(cstr(namesAt + i * 129, 129));

  const fmtAt = find("<formats>") + "<formats>".length;
  const formats: string[] = [];
  for (let i = 0; i < K; i++) formats.push(cstr(fmtAt + i * 57, 57));

  const vlnAt = find("<value_label_names>") + "<value_label_names>".length;
  const valueLabelNames: string[] = [];
  for (let i = 0; i < K; i++) valueLabelNames.push(cstr(vlnAt + i * 129, 129));

  const vlAt = find("<variable_labels>") + "<variable_labels>".length;
  const variableLabels: string[] = [];
  for (let i = 0; i < K; i++) variableLabels.push(cstr(vlAt + i * 321, 321));

  const valueLabels: Record<string, Record<number, string>> = {};
  let pos = find("<value_labels>");
  const end = find("</value_labels>");
  while (pos !== -1 && pos < end) {
    pos = find("<lbl>", pos);
    if (pos === -1 || pos > end) break;
    let p = pos + 5;
    const tableLen = view.getUint32(p, true);
    p += 4;
    const name = cstr(p, 129);
    p += 129 + 3;
    const n = view.getUint32(p, true);
    p += 4;
    const txtlen = view.getUint32(p, true);
    p += 4;
    const offs: number[] = [];
    for (let i = 0; i < n; i++) offs.push(view.getUint32(p + i * 4, true));
    p += 4 * n;
    const vals: number[] = [];
    for (let i = 0; i < n; i++) vals.push(view.getInt32(p + i * 4, true));
    p += 4 * n;
    const txt = bytes.slice(p, p + txtlen);
    const table: Record<number, string> = {};
    for (let i = 0; i < n; i++) {
      let e = offs[i];
      while (e < txt.length && txt[e] !== 0) e++;
      table[vals[i]] = dec.decode(txt.slice(offs[i], e));
    }
    valueLabels[name] = table;
    pos = pos + 5 + tableLen + "</lbl>".length;
  }

  return { release, K, N, varnames, variableLabels, valueLabelNames, types, formats, valueLabels };
}
