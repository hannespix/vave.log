import { describe, expect, it } from 'vitest';
import type { Invoice } from '../src/shared/finance-types';
import {
  StatementError, amountToMinor, bookedRefs, decodeStatement, isoDate, matchTransactions, mentionsNumber,
  nameScore, openAmount, parseStatement, paymentNote, type BankTransaction,
} from '../src/web/finance/bank-import';

const camt08 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
 <BkToCstmrStmt><GrpHdr><MsgId>M1</MsgId></GrpHdr>
  <Stmt><Id>S1</Id><Acct><Id><IBAN>DE02120300000000202051</IBAN></Id></Acct>
   <Ntry><Amt Ccy="EUR">1190.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-10-14</Dt></BookgDt><ValDt><Dt>2026-10-14</Dt></ValDt><AcctSvcrRef>2026101400001</AcctSvcrRef>
    <NtryDtls><TxDtls><Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs>
     <RltdPties><Dbtr><Pty><Nm>Müller &amp; Söhne GmbH</Nm></Pty></Dbtr><DbtrAcct><Id><IBAN>DE89 3704 0044 0532 0130 00</IBAN></Id></DbtrAcct></RltdPties>
     <RmtInf><Ustrd>Rechnung RE-2026-0007</Ustrd><Ustrd>Kd 4711</Ustrd></RmtInf></TxDtls></NtryDtls>
   </Ntry>
   <Ntry><Amt Ccy="EUR">49.90</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>2026-10-14</Dt></BookgDt>
    <NtryDtls><TxDtls><RltdPties><Cdtr><Pty><Nm>Software Abo</Nm></Pty></Cdtr></RltdPties><RmtInf><Ustrd>Abo Oktober</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
   <Ntry><Amt Ccy="EUR">300.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>PDNG</Cd></Sts><BookgDt><Dt>2026-10-15</Dt></BookgDt></Ntry>
  </Stmt></BkToCstmrStmt></Document>`;

const camt02Batch = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
 <Ntry><Amt Ccy="EUR">750,00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-10-10</Dt></BookgDt><AcctSvcrRef>SAMMLER-1</AcctSvcrRef>
  <NtryDtls>
   <TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">500.00</Amt></TxAmt></AmtDtls><RltdPties><Dbtr><Nm>Atelier Nord</Nm></Dbtr></RltdPties><RmtInf><Strd><CdtrRefInf><Ref>RE20260003</Ref></CdtrRefInf></Strd></RmtInf></TxDtls>
   <TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">250.00</Amt></TxAmt></AmtDtls><RltdPties><Dbtr><Nm>Kanzlei West</Nm></Dbtr></RltdPties><RmtInf><Ustrd>RE-2026-0004 Teilzahlung</Ustrd></RmtInf></TxDtls>
  </NtryDtls></Ntry></Stmt></BkToCstmrStmt></Document>`;

const sparkasse = '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"\n'
  + '"DE02120300000000202051";"14.10.26";"14.10.26";"GUTSCHR. UEBERWEISUNG";"RE-2026-0007 Danke";"";"";"E2E-77";"";"";"";"Müller & Söhne GmbH";"DE89370400440532013000";"COBADEFFXXX";"1.190,00";"EUR";"Umsatz gebucht"\n'
  + '"DE02120300000000202051";"13.10.26";"13.10.26";"FOLGELASTSCHRIFT";"Strom";"";"";"";"";"";"";"Stadtwerke";"DE11";"";"-82,10";"EUR";"Umsatz gebucht"\n';

const dkb = '"Girokonto";"DE02120300000000202051"\n""\n"Kontostand vom 15.10.2026:";"12.345,67 €"\n""\n'
  + '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"\n'
  + '"15.10.26";"15.10.26";"Gebucht";"Kanzlei West";"VAVE Studio";"Teilzahlung RE 2026 0004";"Eingang";"DE44500105175407324931";"250,00";"";"";""\n'
  + '"15.10.26";"15.10.26";"Vorgemerkt";"Atelier Nord";"VAVE Studio";"RE-2026-0003";"Eingang";"DE";"500,00";"";"";""\n';

const ing = 'Umsatzanzeige;Datei erstellt am: 15.10.2026 10:00\n\nIBAN;DE02 1203 0000 0000 2020 51\nZeitraum;01.10.2026 - 15.10.2026\n\n'
  + 'Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung\n'
  + '12.10.2026;12.10.2026;Atelier Nord;Gutschrift;Rechnung RE-2026-0003;13.000,00;EUR;500,00;EUR\n';

const inv = (id: string, number: string, total: number, extra: Partial<Invoice> = {}): Invoice => ({
  id, workspace_id: 'w', client_id: 'c-' + id, project_id: null, language: 'de', issue_date: '2026-10-01', due_date: '2026-10-15',
  service_from: '2026-09-01', service_to: '2026-09-30', payment_instructions: '', notes: '', created_at: '', status: 'issued', number,
  currency: 'EUR', lines: [], net_minor: total, tax_minor: 0, total_minor: total, issuer_snapshot: null, customer_snapshot: null,
  issued_at: '2026-10-01', cancellation_of: null, cancellation_reason: '', paid: false, cancellation_id: null, paid_minor: 0, payments: [], ...extra,
} as Invoice);
const tx = (over: Partial<BankTransaction>): BankTransaction => ({ key: 'k' + Math.random().toString(36).slice(2, 13).padEnd(11, '0'), date: '2026-10-14', amount_minor: 0, currency: 'EUR', credit: true, name: '', iban: '', purpose: '', ...over });

describe('Beträge und Daten', () => {
  it('liest deutsche und internationale Schreibweisen exakt in Cent', () => {
    expect(amountToMinor('1.190,00', 'EUR')).toBe(119000);
    expect(amountToMinor('1190.5', 'EUR')).toBe(119050);
    expect(amountToMinor('-82,10', 'EUR')).toBe(-8210);
    expect(amountToMinor('82,10-', 'EUR')).toBe(-8210);
    expect(amountToMinor('1.234.567,89 €', 'EUR')).toBe(123456789);
    expect(amountToMinor('1,234,567.89', 'USD')).toBe(123456789);
    expect(amountToMinor('1.234', 'EUR')).toBe(123400);
    expect(amountToMinor('1500', 'JPY')).toBe(1500);
    expect(amountToMinor('12,345', 'EUR')).toBe(1234500);
    expect(amountToMinor('12,3456', 'EUR')).toBeNull();
    expect(amountToMinor('abc', 'EUR')).toBeNull();
  });
  it('erkennt Datumsformate und weist unmögliche Tage ab', () => {
    expect(isoDate('14.10.26')).toBe('2026-10-14');
    expect(isoDate('1.2.2026')).toBe('2026-02-01');
    expect(isoDate('2026-10-14T08:00:00')).toBe('2026-10-14');
    expect(isoDate('31.02.2026')).toBe('');
    expect(isoDate('')).toBe('');
  });
  it('dekodiert UTF-8 und Windows-1252', () => {
    expect(decodeStatement(new Uint8Array([0xef, 0xbb, 0xbf, 0x4d, 0xc3, 0xbc]))).toBe('Mü');
    expect(decodeStatement(new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]))).toBe('Müller');
  });
});

describe('Kontoauszüge lesen', () => {
  it('CAMT.053.001.08: Gutschriften und Lastschriften, nur gebuchte, Entities und Party-Namen', () => {
    const s = parseStatement(camt08);
    expect(s.format).toBe('camt');
    expect(s.transactions).toHaveLength(2);
    const [credit, debit] = s.transactions;
    expect(credit).toMatchObject({ date: '2026-10-14', amount_minor: 119000, currency: 'EUR', credit: true, name: 'Müller & Söhne GmbH', iban: 'DE89370400440532013000', purpose: 'Rechnung RE-2026-0007 Kd 4711' });
    expect(credit.key).toMatch(/^[0-9a-z]{12}$/);
    expect(debit).toMatchObject({ credit: false, amount_minor: 4990, name: 'Software Abo' });
    expect(parseStatement(camt08).transactions[0].key).toBe(credit.key);
  });
  it('CAMT.053.001.02 mit Sammelbuchung teilt in Einzelzahlungen', () => {
    const s = parseStatement(camt02Batch);
    expect(s.transactions.map((t) => [t.amount_minor, t.name, t.purpose])).toEqual([[50000, 'Atelier Nord', 'RE20260003'], [25000, 'Kanzlei West', 'RE-2026-0004 Teilzahlung']]);
    expect(new Set(s.transactions.map((t) => t.key)).size).toBe(2);
  });
  it('Sparkasse CSV-CAMT in Windows-1252', () => {
    const bytes = new Uint8Array([...sparkasse].map((c) => c.charCodeAt(0)));
    const s = parseStatement(decodeStatement(bytes));
    expect(s.format).toBe('csv');
    expect(s.transactions).toHaveLength(2);
    expect(s.transactions[0]).toMatchObject({ date: '2026-10-14', amount_minor: 119000, credit: true, name: 'Müller & Söhne GmbH', iban: 'DE89370400440532013000', purpose: 'RE-2026-0007 Danke E2E-77' });
    expect(s.transactions[1]).toMatchObject({ credit: false, amount_minor: 8210 });
  });
  it('DKB mit Kontokopf, Zahlungspflichtige*r als Gegenpartei, vorgemerkte Umsätze ausgelassen', () => {
    const s = parseStatement(dkb);
    expect(s.transactions).toEqual([expect.objectContaining({ date: '2026-10-15', amount_minor: 25000, credit: true, name: 'Kanzlei West', purpose: 'Teilzahlung RE 2026 0004' })]);
  });
  it('ING mit Metadaten und Saldo-Spalte', () => {
    const s = parseStatement(ing);
    expect(s.transactions).toEqual([expect.objectContaining({ date: '2026-10-12', amount_minor: 50000, name: 'Atelier Nord', purpose: 'Rechnung RE-2026-0003' })]);
  });
  it('lehnt leere, fremde und kaputte Dateien verständlich ab', () => {
    expect(() => parseStatement('  ')).toThrow(StatementError);
    expect(() => parseStatement('Hallo;Welt\n1;2')).toThrow('format');
    expect(() => parseStatement('<Document><BkToCstmrStmt></BkToCstmrStmt></Document>')).toThrow('noRows');
    expect(() => parseStatement('<Document><Ntry></Document>')).toThrow('format');
    expect(() => parseStatement('Buchungstag;Betrag\nkein;Wert')).toThrow('noRows');
  });
});

describe('Zuordnung zu offenen Rechnungen', () => {
  const invoices = [
    inv('a', 'RE-2026-0007', 119000, { customer_snapshot: { name: 'Müller & Söhne GmbH' } as Invoice['customer_snapshot'] }),
    inv('b', 'RE-2026-0003', 50000),
    inv('c', 'RE-2026-0004', 100000, { paid_minor: 50000, payments: [{ id: 'p', workspace_id: 'w', invoice_id: 'c', paid_on: '2026-10-05', amount_minor: 50000, note: '', created_at: '' }] }),
    inv('d', 'RE-2026-0070', 119000),
    inv('paid', 'RE-2026-0001', 1000, { paid: true }),
    inv('draft', '', 1000, { status: 'draft', number: null }),
  ];
  const nameOf = (i: Invoice) => i.customer_snapshot?.name || (i.id === 'c' ? 'Kanzlei West' : 'Atelier Nord');

  it('findet Nummern ohne Trennzeichen, aber nicht als Teil längerer Nummern', () => {
    expect(mentionsNumber('Rechnung RE 2026 0007 vielen Dank', 'RE-2026-0007')).toBe(true);
    expect(mentionsNumber('re20260007', 'RE-2026-0007')).toBe(true);
    expect(mentionsNumber('RE-2026-00070', 'RE-2026-0007')).toBe(false);
    expect(mentionsNumber('Rg 12', '12')).toBe(false);
    expect(nameScore('Müller & Söhne GmbH', tx({ name: 'MUELLER UND SOEHNE' }))).toBe(0);
    expect(nameScore('Müller & Söhne GmbH', tx({ name: 'Muller Sohne GmbH' }))).toBe(1);
  });
  it('Nummer + Betrag = sicher; Lastschriften und bezahlte/Entwurfs-Rechnungen bleiben außen vor', () => {
    const [p, ...rest] = matchTransactions(parseStatement(camt08).transactions, invoices, nameOf);
    expect(rest).toHaveLength(0);
    expect(p).toMatchObject({ invoiceId: 'a', amount_minor: 119000, confidence: 'high', booked: false });
    expect(p.reasons).toEqual(expect.arrayContaining(['number', 'amount', 'name']));
  });
  it('Teilzahlung mit Nummer trifft den offenen Rest, gleicher Betrag ohne Nummer und Name bleibt offen', () => {
    const [partial] = matchTransactions(parseStatement(dkb).transactions, invoices, nameOf);
    expect(partial).toMatchObject({ invoiceId: 'c', amount_minor: 25000, confidence: 'high' });
    expect(partial.reasons).toContain('partial');
    const [lonely] = matchTransactions([tx({ amount_minor: 119000, name: 'Unbekannt' })], invoices, nameOf);
    expect(lonely).toMatchObject({ invoiceId: null, confidence: null });
    const [byName] = matchTransactions([tx({ amount_minor: 50000, name: 'Atelier Nord GmbH' })], [invoices[1]], nameOf);
    expect(byName).toMatchObject({ invoiceId: 'b', confidence: 'medium' });
  });
  it('Überzahlung bucht höchstens den offenen Rest und sagt es', () => {
    const [p] = matchTransactions([tx({ amount_minor: 60000, purpose: 'RE-2026-0004' })], invoices, nameOf);
    expect(p).toMatchObject({ invoiceId: 'c', amount_minor: 50000 });
    expect(p.reasons).toContain('overpaid');
  });
  it('zwei Eingänge auf dieselbe Rechnung nur mit Nummer, bis der Rest aufgebraucht ist', () => {
    const list = matchTransactions([
      tx({ date: '2026-10-10', amount_minor: 20000, purpose: 'RE-2026-0004 Rate 2' }),
      tx({ date: '2026-10-11', amount_minor: 30000, purpose: 'RE-2026-0004 Rate 3' }),
      tx({ date: '2026-10-12', amount_minor: 10000, purpose: 'RE-2026-0004 Rate 4' }),
    ], invoices, nameOf);
    expect(list.map((p) => p.invoiceId)).toEqual(['c', 'c', null]);
  });
  it('erkennt schon gebuchte Bankbuchungen an der ref in der Notiz', () => {
    const t = parseStatement(camt08).transactions[0];
    const note = paymentNote(t, 'Kontoauszug');
    expect(note.length).toBeLessThanOrEqual(500);
    expect(note).toMatch(/^Kontoauszug · Müller & Söhne GmbH · Rechnung RE-2026-0007 Kd 4711 · ref:[0-9a-z]{12}$/);
    expect(paymentNote(tx({ purpose: 'x'.repeat(900) }), 'Kontoauszug')).toHaveLength(500);
    const paidA = inv('a', 'RE-2026-0007', 119000, { paid: true, paid_minor: 119000, payments: [{ id: 'p', workspace_id: 'w', invoice_id: 'a', paid_on: '2026-10-14', amount_minor: 119000, note, created_at: '' }] });
    expect(bookedRefs([paidA]).has(t.key)).toBe(true);
    const [p] = matchTransactions([t], [paidA, ...invoices.slice(1)], nameOf);
    expect(p).toMatchObject({ booked: true, invoiceId: null });
  });
  it('markiert mögliche Doppelungen aus einem anderen Format und Zahlungen vor dem Rechnungsdatum', () => {
    const withPayment = inv('c', 'RE-2026-0004', 100000, { paid_minor: 25000, payments: [{ id: 'p', workspace_id: 'w', invoice_id: 'c', paid_on: '2026-10-15', amount_minor: 25000, note: 'manuell', created_at: '' }] });
    const [dup] = matchTransactions([tx({ date: '2026-10-15', amount_minor: 25000, purpose: 'RE-2026-0004' })], [withPayment], nameOf);
    expect(dup).toMatchObject({ confidence: 'low' });
    expect(dup.reasons).toContain('duplicate');
    const [early] = matchTransactions([tx({ date: '2026-09-20', amount_minor: 50000, purpose: 'RE-2026-0003' })], invoices, nameOf);
    expect(early.reasons).toContain('early');
    expect(early.confidence).toBe('medium');
  });
  it('rechnet den offenen Rest nur für ausgestellte, nicht stornierte, unbezahlte Rechnungen', () => {
    expect(invoices.map(openAmount)).toEqual([119000, 50000, 50000, 119000, 0, 0]);
    expect(openAmount(inv('x', 'R', 100, { cancellation_id: 'y' }))).toBe(0);
    expect(matchTransactions([tx({ amount_minor: 50000, currency: 'USD', purpose: 'RE-2026-0003' })], invoices, nameOf)[0].invoiceId).toBeNull();
  });
});
