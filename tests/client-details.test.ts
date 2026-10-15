import { describe, expect, it } from 'vitest';
import type { FinanceClient } from '../src/shared/finance-types';
import { clientSchema } from '../src/shared/finance-validation';
import { clientDetails, clientMatches, websiteHref } from '../src/web/finance/clients-company';

const base: FinanceClient = { id: '00000000-0000-4000-8000-000000000001', workspace_id: '00000000-0000-4000-8000-000000000002', name: 'Müller & Söhne GmbH', billing_address: 'Hauptstr. 1\n10115 Berlin', contact_email: 'rechnung@mueller.test', tax_id: 'DE123', language: 'de', created_at: '' };
const empty = { customer_number: '', industry: '', phone: '', website: '', notes: '', contacts: [] };

describe('Kundendetails', () => {
  it('schickt die neuen Felder nur mit, wenn der Datensatz sie kennt oder etwas eingetragen ist', () => {
    expect(clientDetails(base, empty)).toEqual({});
    expect(clientDetails(undefined, empty)).toEqual({});
    expect(clientDetails({ ...base, notes: '' }, empty)).toEqual(empty);
    expect(clientDetails(base, { ...empty, notes: 'Nur PDF' })).toMatchObject({ notes: 'Nur PDF' });
    expect(clientDetails(undefined, { ...empty, contacts: [{ name: 'Anna' }] })).toMatchObject({ contacts: [{ name: 'Anna' }] });
  });
  it('baut sichere Website-Links', () => {
    expect(websiteHref('kunde.de')).toBe('https://kunde.de/');
    expect(websiteHref('http://kunde.de/x')).toBe('http://kunde.de/x');
    expect(websiteHref('javascript:alert(1)')).toBe('');
    expect(websiteHref('  ')).toBe('');
  });
  it('sucht über Name, Nummer, Ansprechpartner und Bemerkungen, unabhängig von Umlauten', () => {
    const c = { ...base, customer_number: 'K-1001', notes: 'Rechnungen nur als PDF', contacts: [{ name: 'Anna Berg', role: 'Marketing', email: 'anna@mueller.test' }] };
    expect(clientMatches(c, '')).toBe(true);
    expect(clientMatches(c, 'muller k-1001')).toBe(true);
    expect(clientMatches(c, 'anna marketing')).toBe(true);
    expect(clientMatches(c, 'pdf')).toBe(true);
    expect(clientMatches(c, 'anna vertrieb')).toBe(false);
  });
  it('validiert Ansprechpartner wie die Datenbank', () => {
    const input = { workspace_id: base.workspace_id, name: 'X', billing_address: '', contact_email: '', tax_id: '', language: 'de' as const };
    expect(clientSchema.safeParse({ ...input, contacts: [{ name: 'Anna', email: 'anna@x.test' }] }).success).toBe(true);
    expect(clientSchema.safeParse({ ...input, contacts: [{ name: '' }] }).success).toBe(false);
    expect(clientSchema.safeParse({ ...input, contacts: [{ name: 'A', email: 'kaputt' }] }).success).toBe(false);
    expect(clientSchema.safeParse({ ...input, contacts: [{ name: 'A', extra: 1 }] }).success).toBe(false);
    expect(clientSchema.safeParse({ ...input, contacts: Array.from({ length: 21 }, () => ({ name: 'A' })) }).success).toBe(false);
    expect(clientSchema.safeParse({ ...input, notes: 'x'.repeat(4001) }).success).toBe(false);
  });
});
