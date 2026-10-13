import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveLocale, translate } from '../src/shared/i18n';
import { I18nProvider, LanguageSwitcher, readLocalePreference, writeLocalePreference, getPreferredLocale } from '../src/web/i18n';
import { errorMessage, entriesCsv, shortDate } from '../src/web/helpers';
import { TaskAssigneeSelect } from '../src/web/components';
import type { Membership, TimeEntry } from '../src/shared/types';

describe('locale choice', () => {
  it('uses the primary system language with English fallback', () => {
    expect(resolveLocale('de-AT')).toBe('de');
    expect(resolveLocale('ZH-Hant-TW')).toBe('zh');
    for (const language of ['en-GB', 'fr-FR', '', 'deceptive']) expect(resolveLocale(language)).toBe('en');
    expect(getPreferredLocale('system', ['fr-FR', 'de-DE'])).toBe('en');
    expect(getPreferredLocale('zh', ['de-DE'])).toBe('zh');
  });
  it('persists an explicit choice and removes it for System', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    expect(readLocalePreference(storage)).toBe('system');
    writeLocalePreference(storage, 'zh'); expect(readLocalePreference(storage)).toBe('zh');
    writeLocalePreference(storage, 'system'); expect(readLocalePreference(storage)).toBe('system');
    storage.setItem('vave-log.locale', 'fr'); expect(readLocalePreference(storage)).toBe('system');
    const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    expect(readLocalePreference(blocked)).toBe('system'); expect(() => writeLocalePreference(blocked, 'de')).not.toThrow();
  });
});

describe('translated presentation', () => {
  it('translates labels and interpolates names without translating user data', () => {
    expect(translate('Anmelden', 'en')).toBe('Sign in');
    expect(translate('Anmelden', 'zh')).toBe('登录');
    expect(translate('Guten Flow, {name}.', 'zh', {name: 'Projekt'})).toContain('Projekt');
    expect(translate('{count} Einträge', 'de', {count: 1234})).toBe('1.234 Einträge');
    expect(translate('Unknown custom name', 'zh')).toBe('Unknown custom name');
  });
  it('renders the selector and form labels in the chosen locale', () => {
    const members = [{user_id:'1',role:'disabled',display_name:'Former',email:'former@example.test'}] as Membership[];
    const html = renderToStaticMarkup(createElement(I18nProvider, {initialLocale:'zh'}, createElement(TaskAssigneeSelect, {members,currentAssignee:'1'}), createElement(LanguageSwitcher)));
    expect(html).toContain('分配给'); expect(html).toContain('Former'); expect(html).toContain('已停用'); expect(html).toContain('系统语言');
  });
  it('formats exports and dates without translating notes or identifiers', () => {
    const entry = {work_date:'2026-10-13',user_id:'u',project_id:'p',minutes:75,note:'Projekt',billable:true,status:'draft'} as TimeEntry;
    const csv = entriesCsv([entry], [], [], 'en');
    expect(csv).toContain('"Date";"Person"'); expect(csv).toContain('"1.25"'); expect(csv).toContain('"Projekt"'); expect(csv).toContain('"Yes";"Draft"');
    expect(entriesCsv([entry], [], [], 'zh')).toContain('"日期"');
    expect(shortDate('2026-10-13', 'en')).toBe('10/13'); expect(shortDate('2026-10-13', 'de')).toBe('13.10.');
  });
  it('maps known server errors and hides unexpected internal details', () => {
    expect(errorMessage(new Error('Invalid login credentials'), 'de')).toBe('E-Mail oder Passwort stimmt nicht.');
    expect(errorMessage({code:'42501',message:'permission denied for table payroll'}, 'zh')).toContain('权限');
    expect(errorMessage(new Error('SQLSTATE: internal payroll address secret'), 'zh')).toBe('操作失败，请重试。');
  });
});
