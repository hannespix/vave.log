/**
 * Liest die Werte einer Excel-Datei (.xlsx) ohne zusätzliche Bibliothek: ZIP-Verzeichnis,
 * Entpacken über DecompressionStream, Werte aus sharedStrings und den Tabellenblättern.
 * Gelesen werden Zahlen und Texte (bei Formeln der zuletzt gespeicherte Wert) sowie
 * verbundene Zellen. Formate, Makros und Formeln selbst bleiben unberührt. Die Datei
 * wird nur im Browser verarbeitet und nirgends hochgeladen.
 */
export type GridValue = string | number | null;
export interface SheetMerge { row: number; col: number; rowEnd: number; colEnd: number }
export interface Sheet { name: string; rows: GridValue[][]; merges: SheetMerge[] }
export class XlsxError extends Error { constructor(message: string) { super(message); this.name = 'XlsxError'; } }

export const PLAN_IMPORT_MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRY = 16 * 1024 * 1024, MAX_INFLATED = 32 * 1024 * 1024;
const MAX_ENTRIES = 512, MAX_SHEETS = 32, MAX_ROWS = 10000, MAX_COLUMNS = 1024, MAX_CELLS = 400000;
const sizeError = () => new XlsxError('Die Tabelle überschreitet die Größenlimits.');
export function assertPlanFileSize(bytes: number) {
  if (bytes > PLAN_IMPORT_MAX_BYTES) throw new XlsxError('Die Datei ist größer als 8 MB.');
}
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new XlsxError('Dieser Browser kann Excel-Dateien nicht entpacken. Kopiere die Tabelle stattdessen aus Excel und füge sie hier ein.');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const chunks: Uint8Array[] = []; let size = 0; const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw sizeError();
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const out = new Uint8Array(size); let offset = 0; for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

/** Liefert eine Funktion, die Dateien aus dem ZIP-Archiv als Text liest (null, wenn es sie nicht gibt). */
function zipReader(bytes: Uint8Array): (name: string) => Promise<string | null> {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new XlsxError('Das ist keine Excel-Datei (.xlsx).');
  const count = u16(bytes, eocd + 10); let offset = u32(bytes, eocd + 16);
  if (count > MAX_ENTRIES) throw sizeError();
  const entries = new Map<string, { method: number; size: number; inflated: number; offset: number }>();
  const decoder = new TextDecoder();
  const damaged = () => new XlsxError('Die Excel-Datei ist beschädigt.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > eocd || u32(bytes, offset) !== 0x02014b50) throw damaged();
    const nameLength = u16(bytes, offset + 28), extra = u16(bytes, offset + 30), comment = u16(bytes, offset + 32);
    const next = offset + 46 + nameLength + extra + comment;
    if (next > eocd) throw damaged();
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, { method: u16(bytes, offset + 10), size: u32(bytes, offset + 20), inflated: u32(bytes, offset + 24), offset: u32(bytes, offset + 42) });
    offset = next;
  }
  let remaining = MAX_INFLATED;
  return async (name) => {
    const e = entries.get(name); if (!e) return null;
    if (e.offset + 30 > bytes.length || u32(bytes, e.offset) !== 0x04034b50) throw damaged();
    const start = e.offset + 30 + u16(bytes, e.offset + 26) + u16(bytes, e.offset + 28);
    if (start + e.size > bytes.length) throw damaged();
    const limit = Math.min(MAX_ENTRY, remaining);
    if (e.inflated > limit || (e.method === 0 && e.size > limit)) throw sizeError();
    const raw = bytes.subarray(start, start + e.size);
    const data = e.method === 0 ? raw : e.method === 8 ? await inflate(raw, limit) : null;
    if (!data) throw new XlsxError('Die Excel-Datei nutzt eine Komprimierung, die hier nicht gelesen werden kann.');
    if (data.length !== e.inflated) throw damaged();
    remaining -= data.length;
    return decoder.decode(data);
  };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e])
  // Excel schreibt Steuerzeichen als _xHHHH_.
  .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => { const code = parseInt(h, 16); return code === 10 || code === 13 || code === 9 ? ' ' : code < 32 ? '' : String.fromCharCode(code); });
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
/** Text eines <si>- oder <is>-Elements: alle <t>-Stücke, ohne phonetische Lesehilfen. */
const richText = (xml: string) => {
  let text = '';
  for (const match of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += match[1];
  return unescapeXml(text);
};
/** „AB12“ → Spalte 27 (0-basiert), Zeile 11 (0-basiert). */
export function cellRef(ref: string): { row: number; col: number } | null {
  const m = /^([A-Z]{1,3})(\d{1,7})$/.exec(ref); if (!m) return null;
  let col = 0; for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
  const row = Number(m[2]);
  return row < 1 || row > MAX_ROWS || col > MAX_COLUMNS ? null : { row: row - 1, col: col - 1 };
}

function parseSheet(xml: string, shared: string[], budget: { cells: number }): { rows: GridValue[][]; merges: SheetMerge[] } {
  const rows: GridValue[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    for (const cell of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = attr(cell[1], 't'), body = cell[2] ?? '';
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: GridValue = null;
      if (type === 'inlineStr') value = richText(body);
      else if (raw == null) value = null;
      else if (type === 's') value = shared[Number(raw)] ?? null;
      else if (type === 'str') value = unescapeXml(raw);
      else if (type === 'b') value = raw === '1' ? 1 : 0;
      else if (type === 'e') value = null;
      else { const n = Number(raw); value = Number.isFinite(n) ? n : unescapeXml(raw); }
      if (value === null || value === '') continue;
      const ref = cellRef(attr(cell[1], 'r') ?? '');
      if (!ref) throw sizeError();
      budget.cells += Math.max(1, ref.col + 1 - (rows[ref.row]?.length ?? 0));
      if (budget.cells > MAX_CELLS) throw sizeError();
      while (rows.length <= ref.row) rows.push([]);
      const line = rows[ref.row]; while (line.length < ref.col) line.push(null); line[ref.col] = value;
    }
  }
  const merges: SheetMerge[] = [];
  for (const m of xml.matchAll(/<mergeCell\b[^>]*\bref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
    const a = cellRef(m[1]), b = cellRef(m[2]);
    if (!a || !b || merges.length >= MAX_ROWS) throw sizeError();
    merges.push({ row: a.row, col: a.col, rowEnd: b.row, colEnd: b.col });
  }
  return { rows, merges };
}

/** Alle Tabellenblätter einer .xlsx-Datei mit ihren Werten. */
export async function readXlsx(file: ArrayBuffer | Uint8Array): Promise<Sheet[]> {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
  assertPlanFileSize(bytes.length);
  if (bytes.length < 22 || u32(bytes, 0) !== 0x04034b50) throw new XlsxError('Das ist keine Excel-Datei (.xlsx). Ältere .xls-Dateien bitte in Excel als .xlsx speichern.');
  const readEntry = zipReader(bytes);
  const workbook = await readEntry('xl/workbook.xml');
  if (!workbook) throw new XlsxError('Das ist keine Excel-Datei (.xlsx).');
  const rels = await readEntry('xl/_rels/workbook.xml.rels') ?? '';
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id'), target = attr(m[0], 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    if (targets.size > MAX_ENTRIES) throw sizeError();
  }
  const sharedXml = await readEntry('xl/sharedStrings.xml') ?? '';
  const shared: string[] = [];
  for (const match of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    if (shared.length >= MAX_CELLS) throw sizeError();
    shared.push(richText(match[1]));
  }
  const sheets: Sheet[] = []; const budget = { cells: 0 }; let n = 0;
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    if (++n > MAX_SHEETS) throw sizeError();
    const name = unescapeXml(attr(m[0], 'name') ?? `Tabelle ${n}`), id = attr(m[0], 'r:id');
    const path = (id && targets.get(id)) || `xl/worksheets/sheet${n}.xml`;
    if (!/worksheets\//.test(path)) continue; // Diagrammblätter haben keine Zellen
    const xml = await readEntry(path); if (!xml) continue;
    sheets.push({ name, ...parseSheet(xml, shared, budget) });
  }
  if (!sheets.length) throw new XlsxError('Die Excel-Datei enthält kein Tabellenblatt.');
  return sheets;
}

/** Aus Excel kopierte Zellen (Tabulator-getrennt) als Raster; Zahlen in deutscher und englischer Schreibweise. */
export function gridFromText(text: string, delimiter: '\t' | ';' = '\t'): GridValue[][] {
  assertPlanFileSize(text.length);
  assertPlanFileSize(new TextEncoder().encode(text).length);
  const rows = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n', MAX_ROWS + 1);
  if (rows.length > MAX_ROWS) throw sizeError();
  let cells = 0;
  return rows.map((line) => {
    const columns = line.split(delimiter, MAX_COLUMNS + 1);
    cells += columns.length;
    if (columns.length > MAX_COLUMNS || cells > MAX_CELLS) throw sizeError();
    return columns.map((cell) => {
      const value = cell.trim(); if (value === '') return null;
      if (/^-?\d{1,6}([.,]\d{1,4})?$/.test(value)) return Number(value.replace(',', '.'));
      return value;
    });
  });
}
