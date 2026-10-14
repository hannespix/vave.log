import { describe, it, expect } from 'vitest';
import { searchPalette, type PaletteEntry } from '../src/web/helpers';

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
