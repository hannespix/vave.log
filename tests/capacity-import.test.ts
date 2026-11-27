import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { cellRef, gridFromText, readXlsx, XlsxError, type GridValue } from '../src/shared/xlsx-read';
import { buildPlanImport, isoWeekStart, isoWeeksInYear, parseCapacityGrid, personCodes, PlanParseError, projectCode, suggestPeople, suggestProjects } from '../src/shared/capacity-import';
import { planImportSchema } from '../src/shared/validation';

// Künstliche Matrix im üblichen Aufbau – keine Kundendaten.
const HEADER = ['', 'Position', 'Person', 'Angebotene St', 'Geplante St', 'CW 51', 'CW 52', 'CW 53', 'CW 1', 'CW 2', 'CW 3'];
const GRID: GridValue[][] = [
  ['CAPACITY 26'],
  [],
  [null, null, null, null, null, '12 I DECEMBER 26', null, null, '01 I JANUARY 27'],
  HEADER,
  ['TEAM'],
  [null, 'PM', 'ANA', null, null, 20, 40, 40, 16, 0, -8],
  [null, '3D', 'BEN', null, null, 40, 40, 40, 40, 40, 40],
  [],
  ['Messe Nordlicht', null, null, 800, 96, 'DISCOVERY PHASE', null, '50% CONCEPT DESIGN', '100% CONCEPT DESIGN', 'SUPERVISION'],
  ['Messe Nordlicht', 'PM', 'ANA', 80, 44, 20, null, null, 24, null, null],
  ['Messe Nordlicht', '3D', 'BEN', null, 52, null, 12.5, null, null, 40, null],
  ['Messe Nordlicht', '3D', null, null, 16, null, null, null, null, null, 16],
  [],
  ['Pitch Aurora', null, null, null, 0, 'PITCH'],
  ['Pitch Aurora', 'CD', 'CLE', null, 0],
  [],
  ['URLAUB'],
  [null, null, 'ANA', null, null, null, 16, 40],
  ['CHINESE NY', null, null, null, null, null, null, null, null, 40],
];

describe('Kapazitätsmatrix aus dem Raster', () => {
  it('erkennt Wochen über den Jahreswechsel, Projekte, Zeilen und Stunden', () => {
    const plan = parseCapacityGrid(GRID);
    expect(plan.title).toBe('CAPACITY 26');
    expect(plan.weeks.map((w) => `${w.week}:${w.start}`)).toEqual(['51:2026-12-14', '52:2026-12-21', '53:2026-12-28', '1:2027-01-04', '2:2027-01-11', '3:2027-01-18']);
    expect(plan.projects.map((p) => p.name)).toEqual(['Messe Nordlicht', 'Pitch Aurora']);
    const [messe, pitch] = plan.projects;
    expect(messe.offered_hours).toBe(800);
    expect(messe.rows).toEqual([
      { role: 'PM', person: 'ANA', offered_hours: 80, cells: { '2026-12-14': 20, '2027-01-04': 24 }, hours: 44, line: 10 },
      { role: '3D', person: 'BEN', offered_hours: null, cells: { '2026-12-21': 12.5, '2027-01-11': 40 }, hours: 52.5, line: 11 },
      { role: '3D', person: '', offered_hours: null, cells: { '2027-01-18': 16 }, hours: 16, line: 12 },
    ]);
    expect(pitch.rows).toHaveLength(1);
    expect(plan.hours).toBe(112.5);
    expect(plan.persons).toEqual(['ANA', 'BEN', 'CLE']);
    expect(plan.roles).toEqual(['3D', 'CD', 'PM']);
    // Team und Urlaub sind abgeleitet: gezählt, nicht übernommen.
    expect(plan.team).toEqual([{ role: 'PM', person: 'ANA' }, { role: '3D', person: 'BEN' }]);
    expect(plan.absencePeople).toEqual(['ANA']);
    expect(plan.warnings).toEqual(['Ohne Stunden: Pitch Aurora']);
  });
  it('liest Phasen aus der Kopfzeile: Stände in Prozent gehören zur selben Phase, das Ende folgt der nächsten', () => {
    const [messe, pitch] = parseCapacityGrid(GRID).projects;
    expect(messe.phases).toEqual([
      { name: 'DISCOVERY PHASE', starts_on: '2026-12-14', ends_on: '2026-12-27' },
      { name: 'CONCEPT DESIGN', starts_on: '2026-12-28', ends_on: '2027-01-10' },
      // Letzte Phase: bis zur letzten verplanten Woche des Projekts.
      { name: 'SUPERVISION', starts_on: '2027-01-11', ends_on: '2027-01-24' },
    ]);
    // Ohne Stunden bleibt die Phase eine Woche lang.
    expect(pitch.phases).toEqual([{ name: 'PITCH', starts_on: '2026-12-14', ends_on: '2026-12-20' }]);
  });
  it('nimmt verbundene Zellen als Dauer der Phase', () => {
    const plan = parseCapacityGrid(GRID, { merges: [{ row: 13, col: 5, rowEnd: 13, colEnd: 8 }, { row: 8, col: 9, rowEnd: 8, colEnd: 9 }] });
    expect(plan.projects[1].phases).toEqual([{ name: 'PITCH', starts_on: '2026-12-14', ends_on: '2027-01-10' }]);
  });
  it('unterscheidet gleichnamige Phasen, die nicht aufeinander folgen', () => {
    const grid: GridValue[][] = [['', 'Rolle', 'Name', 'KW 10', 'KW 11', 'KW 12'], ['Projekt A', null, null, 'Supervision', 'Concept', 'Supervision'], ['Projekt A', 'PM', 'ANA', 8, 8, 8]];
    expect(parseCapacityGrid(grid, { year: 2027 }).projects[0].phases.map((p) => p.name)).toEqual(['Supervision', 'Concept', 'Supervision 2']);
  });
  it('kommt mit deutschen Spaltennamen, anderer Spaltenfolge und ohne Jahresangabe zurecht', () => {
    const grid: GridValue[][] = [
      ['Projekt', 'Mitarbeiter', 'Rolle', 'KW 9', 'KW 10'],
      ['Relaunch', null, null],
      [null, 'Dana Weber', 'Konzept', '7,5', 8],
    ];
    const plan = parseCapacityGrid(grid, { year: 2027 });
    expect(plan.weeks[0].start).toBe('2027-03-01');
    expect(plan.projects[0].rows[0]).toMatchObject({ role: 'Konzept', person: 'Dana Weber', cells: { '2027-03-01': 7.5, '2027-03-08': 8 } });
  });
  it('sagt klar, wenn keine Wochen oder keine Projekte erkennbar sind', () => {
    expect(() => parseCapacityGrid([['Name', 'Stunden'], ['Ana', 8]])).toThrow(PlanParseError);
    expect(() => parseCapacityGrid([['', '', '', 'KW 1', 'KW 2', 'KW 3']])).toThrow(/keine Projektzeilen/);
  });
  it('rechnet ISO-Wochen: KW 1 kann im Dezember beginnen, 2026 hat 53 Wochen', () => {
    expect(isoWeekStart(2026, 1)).toBe('2025-12-29'); expect(isoWeekStart(2027, 1)).toBe('2027-01-04'); expect(isoWeekStart(2026, 53)).toBe('2026-12-28');
    expect(isoWeeksInYear(2026)).toBe(53); expect(isoWeeksInYear(2027)).toBe(52);
  });
});

describe('Zuordnung und Import', () => {
  const members = [
    { user_id: '11111111-1111-4111-8111-111111111111', display_name: 'Ana Müller', email: 'ana.mueller@studio.example' },
    { user_id: '22222222-2222-4222-8222-222222222222', display_name: 'Ben Okafor', email: 'b.okafor@studio.example' },
    { user_id: '33333333-3333-4333-8333-333333333333', display_name: 'Benedikt Aas', email: 'aas@studio.example' },
  ];
  it('schlägt Personen nur bei eindeutigem Kürzel vor', () => {
    expect(personCodes(members[0])).toEqual(expect.arrayContaining(['ana muller', 'ana', 'am', 'amu', 'anm', 'muller']));
    expect(suggestPeople(['ANA', 'Ben Okafor', 'BEN', 'BO', 'XYZ', 'ana.mueller'], members)).toEqual({
      ANA: members[0].user_id, 'Ben Okafor': members[1].user_id, BEN: null, BO: members[1].user_id, XYZ: null, 'ana.mueller': members[0].user_id,
    });
  });
  it('findet vorhandene Projekte über Name oder Code und vergibt sonst freie Codes', () => {
    const projects = [{ id: 'p1', name: 'Messe Nordlicht', code: 'MN-01' }];
    expect(suggestProjects(['messe  NORDLICHT', 'MN-01', 'Pitch Aurora'], projects)).toEqual({ 'messe  NORDLICHT': 'p1', 'MN-01': 'p1', 'Pitch Aurora': null });
    const taken = new Set(['pa-01']);
    expect(projectCode('Pitch Aurora', taken)).toBe('PA-02'); expect(projectCode('Pitch Aurora', taken)).toBe('PA-03'); expect(projectCode('Übersee', taken)).toBe('UBER-01');
  });
  it('baut einen gültigen Import: Stunden in Minuten, offene Zeilen mit Kürzel als Notiz, übersprungene Projekte fehlen', () => {
    const plan = parseCapacityGrid(GRID);
    const result = buildPlanImport(plan, { people: { ANA: members[0].user_id, BEN: null }, projects: { 'Messe Nordlicht': '44444444-4444-4444-8444-444444444444', 'Pitch Aurora': null }, replace: true }, ['PA-01']);
    expect(() => planImportSchema.parse(result)).not.toThrow();
    expect(result.service_types.sort()).toEqual(['3D', 'CD', 'PM']);
    expect(result.projects[0]).toMatchObject({ project_id: '44444444-4444-4444-8444-444444444444', budget_minutes: 48000 });
    expect(result.projects[0].create).toBeUndefined();
    expect(result.projects[0].rows[0]).toEqual({ user_id: members[0].user_id, service_type: 'PM', offered_minutes: 4800, note: '', cells: { '2026-12-14': 1200, '2027-01-04': 1440 } });
    expect(result.projects[0].rows[1]).toMatchObject({ user_id: null, note: 'BEN', cells: { '2026-12-21': 750, '2027-01-11': 2400 } });
    expect(result.projects[1]).toMatchObject({ project_id: null, create: { code: 'PA-02', name: 'Pitch Aurora', budget_minutes: 0 } });
    const skipped = buildPlanImport(plan, { people: {}, projects: { 'Pitch Aurora': 'skip' }, replace: false }, []);
    expect(skipped.projects.map((p) => p.create?.name)).toEqual(['Messe Nordlicht']); expect(skipped.replace).toBe(false);
  });
});

// ---------------------------------------------------------------- Excel-Datei

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (data: Uint8Array) => { let c = 0xffffffff; for (const b of data) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** Kleines ZIP-Archiv wie Excel es schreibt: wahlweise komprimiert (deflate) oder unkomprimiert. */
function zip(files: Record<string, string>, compress = true): Uint8Array {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = enc.encode(content), data = compress ? new Uint8Array(deflateRawSync(raw)) : raw, nameBytes = enc.encode(name);
    const local = new DataView(new ArrayBuffer(30)); local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(8, compress ? 8 : 0, true); local.setUint32(14, crc32(raw), true); local.setUint32(18, data.length, true); local.setUint32(22, raw.length, true); local.setUint16(26, nameBytes.length, true);
    const head = new DataView(new ArrayBuffer(46)); head.setUint32(0, 0x02014b50, true); head.setUint16(4, 20, true); head.setUint16(6, 20, true); head.setUint16(10, compress ? 8 : 0, true); head.setUint32(16, crc32(raw), true); head.setUint32(20, data.length, true); head.setUint32(24, raw.length, true); head.setUint16(28, nameBytes.length, true); head.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data); central.push(new Uint8Array(head.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let at = 0; for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}
const WORKBOOK = { 'xl/workbook.xml': '<workbook><sheets><sheet name="PLAN &amp; TEAM" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Position</t></si><si><r><t>CW </t></r><r><rPr><b/></rPr><t>23</t></r><rPh><t>ignoriert</t></rPh></si><si><t xml:space="preserve">Müller &amp; Söhne</t></si><si><t>PM</t></si></sst>',
  'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
    <row r="1"><c r="B1" t="s"><v>0</v></c><c r="F1" t="s"><v>1</v></c><c r="G1" t="inlineStr"><is><t>CW 24</t></is></c></row>
    <row r="3"><c r="A3" t="s"><v>2</v></c><c r="D3"><f>(10+5)*8</f><v>120</v></c><c r="F3" t="str"><f>"DIS"&amp;"COVERY"</f><v>DISCOVERY</v></c></row>
    <row r="4"><c r="A4" t="s"><v>2</v></c><c r="B4" t="s"><v>3</v></c><c r="C4" t="inlineStr"><is><t>ANA</t></is></c><c r="F4"><v>7.5</v></c><c r="G4" s="3"/><c r="H4" t="e"><v>#REF!</v></c></row>
  </sheetData><mergeCells count="1"><mergeCell ref="F3:G3"/></mergeCells></worksheet>` };

describe('Excel-Datei lesen', () => {
  it.each([[true, 'komprimiert'], [false, 'unkomprimiert']])('liest Werte, Formelergebnisse, Texte und verbundene Zellen (%s: %s)', async (compress) => {
    const [sheet] = await readXlsx(zip(WORKBOOK, compress));
    expect(sheet.name).toBe('PLAN & TEAM');
    expect(sheet.rows[0]).toEqual([null, 'Position', null, null, null, 'CW 23', 'CW 24']);
    expect(sheet.rows[1]).toEqual([]);
    expect(sheet.rows[2]).toEqual(['Müller & Söhne', null, null, 120, null, 'DISCOVERY']);
    expect(sheet.rows[3]).toEqual(['Müller & Söhne', 'PM', 'ANA', null, null, 7.5]);
    expect(sheet.merges).toEqual([{ row: 2, col: 5, rowEnd: 2, colEnd: 6 }]);
    const plan = parseCapacityGrid(sheet.rows, { merges: sheet.merges, year: 2027 });
    expect(plan.projects[0]).toMatchObject({ name: 'Müller & Söhne', offered_hours: 120, phases: [{ name: 'DISCOVERY', starts_on: '2027-06-07', ends_on: '2027-06-20' }], rows: [{ person: 'ANA', role: 'PM', hours: 7.5 }] });
  });
  it('lehnt anderes als .xlsx verständlich ab', async () => {
    await expect(readXlsx(new TextEncoder().encode('Name;Stunden\nAna;8\n'.repeat(4)))).rejects.toThrow(XlsxError);
    await expect(readXlsx(zip({ 'readme.txt': 'kein Excel' }))).rejects.toThrow('Das ist keine Excel-Datei (.xlsx).');
  });
  it('rechnet Zellbezüge und liest eingefügte Tabellen', () => {
    expect(cellRef('A1')).toEqual({ row: 0, col: 0 }); expect(cellRef('AN134')).toEqual({ row: 133, col: 39 }); expect(cellRef('1A')).toBeNull();
    expect(gridFromText('\tRolle\tName\tKW 9\tKW 10\r\nRelaunch\t\t\t\t\r\n\tPM\tAna\t7,5\t8\n')).toEqual([[null, 'Rolle', 'Name', 'KW 9', 'KW 10'], ['Relaunch', null, null, null, null], [null, 'PM', 'Ana', 7.5, 8]]);
  });
  it('begrenzt Zellkoordinaten auf 10.000 Zeilen und 1.024 Spalten', () => {
    expect(cellRef('AMJ10000')).toEqual({row:9999,col:1023});
    expect(cellRef('A10001')).toBeNull();
    expect(cellRef('AMK2')).toBeNull();
    expect(cellRef('A0')).toBeNull();
  });
  it('meldet Tabellengrößen über der Spaltengrenze verständlich', () => {
    expect(() => gridFromText(Array(1025).fill('1').join('\t'))).toThrow(XlsxError);
  });
});
