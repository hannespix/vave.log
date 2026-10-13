import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, root), 'utf8');
const payload = JSON.parse(read('supabase/auth-email-branding.json')) as Record<string, string>;
const subjects = JSON.parse(read('supabase/templates/subjects.json')) as Record<string, { dashboard: string; subject: string }>;
const authKeys = ['confirmation', 'invite', 'magic_link', 'recovery', 'email_change', 'reauthentication'];
const notificationKeys = ['password_changed', 'email_changed', 'phone_changed', 'identity_linked', 'identity_unlinked', 'mfa_factor_enrolled', 'mfa_factor_unenrolled'].map(key => `${key}_notification`);
const keys = [...authKeys, ...notificationKeys];

// Verify the complete Go control-flow contract, including the nil guard and
// string formatting before comparison. We deliberately do not emulate Go.
function variants(source: string) {
  const match = source.match(/^\{\{ if and \.Data \(eq \(printf "%s" \.Data\.locale\) "de"\) \}\}([\s\S]*?)\{\{ else if and \.Data \(eq \(printf "%s" \.Data\.locale\) "zh"\) \}\}([\s\S]*?)\{\{ else \}\}([\s\S]*?)\{\{ end \}\}\n?$/);
  expect(match, 'Only whitelisted German/Chinese branches, with English in the final fallback; nil metadata must short-circuit safely').not.toBeNull();
  return { de: match![1], zh: match![2], en: match![3] };
}

describe('localized Supabase email artifacts', () => {
  it('ships only the 13 subjects and bodies, without changing Auth configuration', () => {
    expect(Object.keys(subjects).sort()).toEqual([...keys].sort());
    expect(Object.keys(payload).sort()).toEqual(keys.flatMap(key => [`mailer_subjects_${key}`, `mailer_templates_${key}_content`]).sort());
  });

  it.each(keys)('%s contains three complete localized emails with guarded English fallback', key => {
    const body = read(`supabase/templates/${key}.html`);
    expect(payload[`mailer_templates_${key}_content`]).toBe(body);
    expect(payload[`mailer_subjects_${key}`]).toBe(subjects[key].subject);
    const bodies = variants(body);
    const titles = variants(subjects[key].subject);
    for (const locale of ['en', 'de', 'zh'] as const) {
      const html = bodies[locale];
      expect(html).toContain(`<html lang="${locale === 'zh' ? 'zh-CN' : locale}">`);
      expect(html).toContain(`<title>${titles[locale]}</title>`);
      expect(titles[locale]).toMatch(/^VAVE\.LOG – .+/);
      expect(html).toContain('#641dff');
      expect(html).toContain('#e8ffb9');
      expect(html).toContain('<!--[if mso]>');
      expect(html).toContain('@media only screen and (max-width:480px)');
      expect(html).not.toMatch(/<script|<img|\.Data|<no value>|undefined|\[object Object\]/);
      expect(html).toContain({ en: 'Automated message about your VAVE.LOG account.', de: 'Automatische Nachricht zu deinem VAVE.LOG-Konto.', zh: '这是一封有关你 VAVE.LOG 账户的自动通知。' }[locale]);
      expect(html).not.toMatch(/English|Deutsch|简体中文/);
      if (key === 'reauthentication') {
        expect(html.match(/\{\{ \.Token \}\}/g)).toHaveLength(1);
        expect(html).not.toContain('.ConfirmationURL');
      } else if (authKeys.includes(key)) {
        expect(html.match(/href="\{\{ \.ConfirmationURL \}\}"/g)).toHaveLength(2);
        expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)).toHaveLength(3);
        expect(html).not.toContain('.Token');
      } else {
        expect(html).not.toContain('{{');
      }
    }
    expect(new Set(Object.values(titles)).size).toBe(3);
  });

  it('uses translated confirmation subjects and actions, including the default English branch', () => {
    const title = variants(subjects.confirmation.subject);
    expect(title).toEqual({ en: 'VAVE.LOG – Confirm your email address', de: 'VAVE.LOG – Bestätige deine E-Mail-Adresse', zh: 'VAVE.LOG – 确认你的电子邮箱' });
    const body = variants(read('supabase/templates/confirmation.html'));
    expect(body.en).toContain('Confirm email address</a>');
    expect(body.de).toContain('E-Mail-Adresse bestätigen</a>');
    expect(body.zh).toContain('确认电子邮箱</a>');
  });

  it('provides all 39 examples with anchor-based language navigation and inert sample links', () => {
    const preview = read('docs/email-preview.html');
    for (const locale of ['en', 'de', 'zh']) {
      expect(preview).toContain(`href="#language-${locale}"`);
      for (const key of keys) expect(preview).toContain(`id="${locale}-${key}"`);
    }
    expect(preview).not.toMatch(/<script|\{\{|href="https?:\/\//);
    expect(preview.match(/123456/g)).toHaveLength(3);
  });
});
