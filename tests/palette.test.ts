import { describe, it, expect } from 'vitest';
import { invoiceSearchEntry, searchPalette, type PaletteEntry } from '../src/web/helpers';
import type { Invoice } from '../src/shared/finance-types';
import type { Project } from '../src/shared/types';

const entry = (id: string, kind: PaletteEntry['kind'], title: string, keywords = '', subtitle?: string): PaletteEntry => ({ id, kind, title, keywords, subtitle });
const items = [
  entry('a:projects', 'area', 'Projekte', 'Projekte'),
  entry('a:time', 'area', 'Zeiten', 'Zeiten'),
  entry('p:1', 'project', 'VAV-001 · Brand Experience', 'VAV-001 Brand Experience VAVE', 'VAVE'),
  entry('p:2', 'project', 'STR-002 · Straßenfest', 'STR-002 Straßenfest Stadt'),
  entry('t:1', 'task', 'Branding überarbeiten', 'Branding überarbeiten VAV-001'),
  entry('m:1', 'person', 'Mira Müller', 'Mira Müller mira@example.test', 'mira@example.test'),
];

describe('global search palette', () => {
  it('shows only areas while the query is empty', () => {
    expect(searchPalette(items, '  ').map(i => i.id)).toEqual(['a:projects', 'a:time']);
  });
  it('requires every token to match, in any order and diacritics-tolerant', () => {
    expect(searchPalette(items, 'strassen stadt').map(i => i.id)).toEqual(['p:2']);
    expect(searchPalette(items, 'muller').map(i => i.id)).toEqual(['m:1']);
    expect(searchPalette(items, 'brand zeiten')).toEqual([]);
  });
  it('ranks prefix over word start over substring and respects the limit', () => {
    const ids = searchPalette(items, 'brand').map(i => i.id);
    // „Branding …" beginnt damit (Präfix), „… Brand Experience" erst am Wortanfang.
    expect(ids).toEqual(['t:1', 'p:1']);
    expect(searchPalette(items, 'e', 2)).toHaveLength(2);
  });
});

describe('invoiceSearchEntry', () => {
  const base: Omit<Invoice, 'status' | 'number' | 'paid' | 'customer_snapshot'> = { id: 'inv-1', workspace_id: 'w', client_id: 'c', project_id: 'p', language: 'de', issue_date: '2026-10-05', due_date: '2026-10-19', service_from: '2026-09-01', service_to: '2026-09-30', notes: '', payment_instructions: '', created_at: '2026-10-05T09:00:00Z', currency: 'EUR', lines: [], net_minor: 100000, tax_minor: 19000, total_minor: 119000, issuer_snapshot: null, issued_at: '2026-10-05T09:00:00Z', cancellation_of: null, cancellation_reason: '', cancellation_id: null };
  const client = { name: 'Nordlicht GmbH' } as unknown as NonNullable<Invoice['customer_snapshot']>;
  const project = { id: 'p', code: 'NOR-003', name: 'Relaunch' } as Project;
  it('names issued invoices by number and client and carries status, amount and date', () => {
    const entry = invoiceSearchEntry({ ...base, status: 'issued', number: 'RE-2026-0012', paid: false, customer_snapshot: client }, project, 'de');
    expect(entry).toMatchObject({ id: 'invoice:inv-1', kind: 'invoice', title: 'RE-2026-0012 · Nordlicht GmbH' });
    expect(entry.subtitle).toMatch(/^Offen · 1\.190,00\s€ · 05\.10\.$/);
    expect(entry.keywords).toContain('NOR-003');
    expect(entry.keywords).toContain('Rechnung');
    expect(invoiceSearchEntry({ ...base, status: 'issued', number: 'RE-2026-0012', paid: true, customer_snapshot: client }, project, 'en').subtitle).toMatch(/^Paid · €1,190\.00 · /);
  });
  it('labels drafts and cancellations and survives a missing project and client', () => {
    const draft = invoiceSearchEntry({ ...base, status: 'draft', number: null, paid: false, customer_snapshot: null }, undefined, 'de');
    expect(draft.title).toBe('Entwurf');
    expect(draft.subtitle?.startsWith('Entwurf · ')).toBe(true);
    const storno = invoiceSearchEntry({ ...base, status: 'cancellation', number: 'RE-2026-0013', paid: false, customer_snapshot: client, currency: 'JPY', total_minor: 5000 }, project, 'en');
    expect(storno.subtitle).toContain('¥5,000');
    expect(storno.subtitle?.startsWith('Cancellation')).toBe(true);
  });
  it('is found through the palette by number, client or project code', () => {
    const entry = invoiceSearchEntry({ ...base, status: 'issued', number: 'RE-2026-0012', paid: false, customer_snapshot: client }, project, 'de');
    const list = [...items, entry];
    for (const q of ['0012', 'nordlicht', 'nor-003 rechnung', 'offen 1.190']) expect(searchPalette(list, q).map(x => x.id)).toContain('invoice:inv-1');
  });
});
