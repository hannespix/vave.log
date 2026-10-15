import { describe, it, expect } from 'vitest';
import { filterMembers } from '../src/web/helpers';
import type { Membership } from '../src/shared/types';

const member = (user_id: string, display_name: string, role: Membership['role'], email: string, weekly_capacity_minutes: number | null = null, extra: Partial<Membership> = {}): Membership =>
  ({ workspace_id: 'w', user_id, role, display_name, email, weekly_capacity_minutes, ...extra } as Membership);
const team = [
  member('1', 'Zoe Weber', 'member', 'zoe@example.test', 2400),
  member('2', 'Ömer Aydın', 'manager', 'oemer@example.test'),
  member('3', 'anna Schulz', 'owner', 'anna@example.test', 1200),
  member('4', 'Bernd Krause', 'disabled', 'bernd@example.test', 2400),
  member('5', 'Mira Müller', 'member', 'demo-mira@internal.test', null, { is_demo: true, demo_title: 'Art Director', demo_studio: 'Studio Nord' }),
];
const names = (list: Membership[]) => list.map(m => m.display_name);
const all = { query: '', role: 'all' as const, sort: 'name' as const };

describe('filterMembers', () => {
  it('sortiert nach Name ohne Rücksicht auf Groß-/Kleinschreibung und Umlaute', () => {
    expect(names(filterMembers(team, all, 'de'))).toEqual(['anna Schulz', 'Bernd Krause', 'Mira Müller', 'Ömer Aydın', 'Zoe Weber']);
    expect(names(filterMembers(team, { ...all, sort: 'name_desc' }, 'de'))[0]).toBe('Zoe Weber');
  });
  it('sortiert nach Rolle (Inhaber:in vor Leitung vor Mitglied vor Deaktiviert), Gleichstand nach Name', () => {
    expect(names(filterMembers(team, { ...all, sort: 'role' }, 'de'))).toEqual(['anna Schulz', 'Ömer Aydın', 'Mira Müller', 'Zoe Weber', 'Bernd Krause']);
  });
  it('sortiert nach Kapazität absteigend, nicht gepflegte ans Ende', () => {
    expect(names(filterMembers(team, { ...all, sort: 'capacity' }, 'de'))).toEqual(['Bernd Krause', 'Zoe Weber', 'anna Schulz', 'Mira Müller', 'Ömer Aydın']);
  });
  it('filtert nach Rolle und blendet mit „Nur aktive“ Deaktivierte aus', () => {
    expect(names(filterMembers(team, { ...all, role: 'member' }, 'de'))).toEqual(['Mira Müller', 'Zoe Weber']);
    expect(names(filterMembers(team, { ...all, role: 'active' }, 'de'))).not.toContain('Bernd Krause');
    expect(filterMembers(team, { ...all, role: 'active' }, 'de')).toHaveLength(4);
  });
  it('sucht mehrteilig und diakritika-tolerant über Name, E-Mail, Rolle und Demo-Angaben', () => {
    expect(names(filterMembers(team, { ...all, query: 'omer' }, 'de'))).toEqual(['Ömer Aydın']);
    expect(names(filterMembers(team, { ...all, query: 'leitung' }, 'de'))).toEqual(['Ömer Aydın']);
    expect(names(filterMembers(team, { ...all, query: 'manager' }, 'en'))).toEqual(['Ömer Aydın']);
    expect(names(filterMembers(team, { ...all, query: 'zoe@example' }, 'de'))).toEqual(['Zoe Weber']);
    expect(names(filterMembers(team, { ...all, query: 'studio art' }, 'de'))).toEqual(['Mira Müller']);
    expect(filterMembers(team, { ...all, query: 'studio zoe' }, 'de')).toHaveLength(0);
  });
  it('findet Demo-Personen nicht über ihre unsichtbare interne E-Mail', () => {
    expect(filterMembers(team, { ...all, query: 'internal' }, 'de')).toHaveLength(0);
  });
  it('verändert die übergebene Liste nicht', () => {
    const copy = [...team];
    filterMembers(team, { ...all, sort: 'name_desc' }, 'de');
    expect(team).toEqual(copy);
  });
});
