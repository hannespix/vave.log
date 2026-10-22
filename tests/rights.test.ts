import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODULES, MODULE_LEVELS, TEMPLATES, TEMPLATE_RIGHTS, can, effectiveRights, grantable, matchTemplate, templateFor, visibleAreas } from '../src/shared/rights';

describe('rights per account', () => {
  it('mirrors the database templates exactly', () => {
    const sql = readFileSync('supabase/migrations/20261022100000_rechte_je_konto.sql', 'utf8');
    for (const template of TEMPLATES) {
      const match = sql.match(new RegExp(`when '${template}' then '(\\{[^']*\\})'::jsonb`));
      const fromSql = JSON.parse(match ? match[1]! : sql.match(/else '(\{[^']*\})'::jsonb/)![1]!);
      expect(fromSql, template).toEqual(TEMPLATE_RIGHTS[template]);
    }
    // mitarbeit ist die Vorgabe (else-Zweig) der Datenbank.
    expect(JSON.parse(sql.match(/else '(\{[^']*\})'::jsonb/)![1]!)).toEqual(TEMPLATE_RIGHTS.mitarbeit);
    for (const template of TEMPLATES) for (const module of MODULES) expect(MODULE_LEVELS[module], `${template}.${module}`).toContain(TEMPLATE_RIGHTS[template][module]);
  });
  it('resolves owners, legacy roles, templates and individual matrices', () => {
    expect(effectiveRights({ role: 'owner' })).toEqual(TEMPLATE_RIGHTS.admin);
    expect(effectiveRights({ role: 'manager' })).toEqual(TEMPLATE_RIGHTS.leitung);
    expect(effectiveRights({ role: 'member' })).toEqual(TEMPLATE_RIGHTS.mitarbeit);
    expect(effectiveRights({ role: 'member', rights_template: 'finanzen' })).toEqual(TEMPLATE_RIGHTS.finanzen);
    expect(effectiveRights({ role: 'member', rights_template: 'individuell', permissions: { ...TEMPLATE_RIGHTS.mitarbeit, finance: 'view', planning: 'edit' } })).toMatchObject({ finance: 'view', planning: 'none', tasks: 'edit' });
    expect(effectiveRights({ role: 'disabled', rights_template: 'admin' }).finance).toBe('none');
    expect(effectiveRights(undefined).projects).toBe('view');
    expect(templateFor({ role: 'manager' })).toBe('leitung'); expect(templateFor({ role: 'owner', rights_template: 'lesen' })).toBe('admin'); expect(templateFor({ role: 'member', rights_template: 'unbekannt' })).toBe('mitarbeit');
  });
  it('checks levels, grant limits, template matching and navigation areas', () => {
    expect(can(TEMPLATE_RIGHTS.projektplanung, 'time_team')).toBe(true); expect(can(TEMPLATE_RIGHTS.projektplanung, 'time_team', 'edit')).toBe(false);
    expect(grantable(TEMPLATE_RIGHTS.personal, TEMPLATE_RIGHTS.finanzen)).toEqual(['finance']);
    expect(grantable(TEMPLATE_RIGHTS.admin, TEMPLATE_RIGHTS.admin)).toEqual([]);
    expect(matchTemplate({ ...TEMPLATE_RIGHTS.lesen })).toBe('lesen'); expect(matchTemplate({ ...TEMPLATE_RIGHTS.lesen, finance: 'edit' })).toBe('individuell');
    expect(visibleAreas(TEMPLATE_RIGHTS.finanzen)).toEqual({ team: false, finance: true, planning: false });
    expect(visibleAreas(TEMPLATE_RIGHTS.projektplanung)).toEqual({ team: true, finance: false, planning: true });
    expect(visibleAreas(TEMPLATE_RIGHTS.mitarbeit)).toEqual({ team: false, finance: false, planning: false });
  });
});
