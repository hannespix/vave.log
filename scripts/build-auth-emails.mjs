import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// No network calls, user data, credentials or sending. Supabase renders the
// remaining Go template variables when it sends a transactional email.
const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const templates = [
  {
    key: 'confirmation', label: 'Confirm sign up', subject: 'VAVE.LOG – Bestätige deine E-Mail-Adresse',
    eyebrow: 'DEIN ACCOUNT', title: 'Einmal bestätigen.<br>Dann kann es losgehen.',
    preview: 'Bestätige deine E-Mail-Adresse für VAVE.LOG.',
    paragraphs: ['Willkommen bei VAVE.LOG. Mit einem Klick bestätigst du deine E-Mail-Adresse und schließt deine Registrierung ab.', 'Öffne den Link möglichst im selben Browser, in dem du deinen Account erstellt hast.'],
    action: 'E-Mail-Adresse bestätigen',
    note: 'Du hast keinen Account erstellt? Dann ignoriere diese Nachricht. Ohne deine Bestätigung wird die Registrierung nicht abgeschlossen.',
  },
  {
    key: 'invite', label: 'Invite user', subject: 'VAVE.LOG – Deine Einladung',
    eyebrow: 'DEINE EINLADUNG', title: 'Dein Zugang<br>zu VAVE.LOG.',
    preview: 'Du wurdest eingeladen, einen VAVE.LOG-Account anzulegen.',
    paragraphs: ['Du wurdest eingeladen, einen Account bei VAVE.LOG anzulegen. Über den folgenden Link nimmst du die Einladung an.', 'Der Zugang zu einem Workspace wird separat von dessen Administration vergeben.'],
    action: 'Einladung annehmen', note: 'Du hast diese Einladung nicht erwartet? Kläre sie mit der einladenden Person, bevor du den Link öffnest.',
  },
  {
    key: 'magic_link', label: 'Magic link', subject: 'VAVE.LOG – Dein Anmeldelink',
    eyebrow: 'DEINE ANMELDUNG', title: 'Ein Klick.<br>Du bist drin.',
    preview: 'Dein persönlicher Link zur Anmeldung bei VAVE.LOG.',
    paragraphs: ['Du hast einen Anmeldelink für VAVE.LOG angefordert. Öffne ihn möglichst im selben Browser, in dem du die Anmeldung begonnen hast.'],
    action: 'Bei VAVE.LOG anmelden', note: 'Du hast diesen Link nicht angefordert? Ignoriere die Nachricht und gib den Link nicht weiter.',
  },
  {
    key: 'recovery', label: 'Reset password', subject: 'VAVE.LOG – Passwort zurücksetzen',
    eyebrow: 'DEIN PASSWORT', title: 'Ein neues Passwort.<br>Für deinen Account.',
    preview: 'Lege ein neues Passwort für deinen VAVE.LOG-Account fest.',
    paragraphs: ['Du hast angefordert, dein Passwort zurückzusetzen. Über den folgenden Link kannst du ein neues Passwort festlegen.', 'Öffne den Link im selben Browser, in dem du ihn angefordert hast.'],
    action: 'Neues Passwort festlegen', note: 'Du hast kein neues Passwort angefordert? Ignoriere diese Nachricht. Dein bisheriges Passwort bleibt gültig.',
  },
  {
    key: 'email_change', label: 'Change email address', subject: 'VAVE.LOG – Änderung deiner E-Mail-Adresse bestätigen',
    eyebrow: 'DEINE E-MAIL-ADRESSE', title: 'Neue Adresse.<br>Einmal bestätigen.',
    preview: 'Bestätige die angeforderte Änderung deiner E-Mail-Adresse.',
    paragraphs: ['Für deinen VAVE.LOG-Account wurde eine Änderung der E-Mail-Adresse angefordert. Bestätige die Änderung über den folgenden Link.', 'Wenn du je eine Bestätigung an deine bisherige und deine neue Adresse erhältst, öffne bitte beide Links.'],
    action: 'Änderung bestätigen', note: 'Du hast diese Änderung nicht angefordert? Bestätige sie nicht. Öffne VAVE.LOG über deine bekannte Adresse und prüfe deinen Account.',
  },
  {
    key: 'reauthentication', label: 'Reauthentication', subject: 'VAVE.LOG – Dein Sicherheitscode',
    eyebrow: 'SICHERHEITSBESTÄTIGUNG', title: 'Kurz bestätigen.<br>Sicher weitermachen.',
    preview: 'Dein einmaliger Sicherheitscode für VAVE.LOG.',
    paragraphs: ['Gib diesen Code in der VAVE.LOG-Abfrage ein, die du gerade geöffnet hast. So bestätigst du die angeforderte Aktion.'],
    code: true, note: 'Teile diesen Code mit niemandem. Du hast keine Aktion gestartet? Ignoriere diese Nachricht.',
  },
  ...[
    ['password_changed', 'Password changed', 'Dein Passwort wurde geändert', 'Das Passwort für deinen VAVE.LOG-Account wurde geändert.'],
    ['email_changed', 'Email address changed', 'Deine E-Mail-Adresse wurde geändert', 'Die E-Mail-Adresse deines VAVE.LOG-Accounts wurde geändert.'],
    ['phone_changed', 'Phone number changed', 'Deine Telefonnummer wurde geändert', 'Die hinterlegte Telefonnummer deines VAVE.LOG-Accounts wurde geändert.'],
    ['identity_linked', 'Sign-in method linked', 'Eine Anmeldemethode wurde verknüpft', 'Deinem VAVE.LOG-Account wurde eine weitere Anmeldemethode hinzugefügt.'],
    ['identity_unlinked', 'Sign-in method removed', 'Eine Anmeldemethode wurde entfernt', 'Eine Anmeldemethode wurde aus deinem VAVE.LOG-Account entfernt.'],
    ['mfa_factor_enrolled', 'Verification method added', 'Eine Sicherheitsmethode wurde hinzugefügt', 'Für deinen VAVE.LOG-Account wurde eine weitere Methode zur Anmeldebestätigung eingerichtet.'],
    ['mfa_factor_unenrolled', 'Verification method removed', 'Eine Sicherheitsmethode wurde entfernt', 'Eine Methode zur Anmeldebestätigung wurde aus deinem VAVE.LOG-Account entfernt.'],
  ].map(([key, label, subject, body]) => ({
    key: `${key}_notification`, label, subject: `VAVE.LOG – ${subject}`,
    eyebrow: 'DEINE KONTO-SICHERHEIT', title: `${escape(subject)}.`, preview: body,
    paragraphs: [body, 'Das warst du selbst? Dann ist nichts weiter zu tun.'],
    notification: true,
    note: 'Du warst das nicht? Öffne VAVE.LOG über deine bekannte Adresse, sichere deinen Account mit einem neuen Passwort und informiere die Person, die deinen Workspace verwaltet. Wenn du keinen Zugriff mehr hast, wende dich direkt an diese Person.',
  })),
];

const paragraph = text => `<p style="margin:0 0 18px;color:#3e4439;font-size:16px;line-height:26px;">${escape(text)}</p>`;
function card(template) {
  const action = template.action ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;"><tr><td bgcolor="#641dff" style="border-radius:8px;text-align:center;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;border:16px solid #641dff;border-left-width:22px;border-right-width:22px;border-radius:8px;background:#641dff;color:#ffffff;font-size:16px;font-weight:bold;line-height:22px;text-decoration:none;mso-padding-alt:0;">${escape(template.action)}</a></td></tr></table>
<p style="margin:0 0 24px;color:#5f655a;font-size:13px;line-height:21px;">Der Link ist nur einmal und zeitlich begrenzt gültig. Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br><a href="{{ .ConfirmationURL }}" style="color:#641dff;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">{{ .ConfirmationURL }}</a></p>` : '';
  const code = template.code ? `<div style="margin:26px 0;padding:20px 12px;background:#e8ffb9;border:1px solid #d8edb0;border-radius:8px;text-align:center;font-family:Consolas,'Courier New',monospace;font-size:30px;line-height:40px;letter-spacing:5px;color:#1b1b1b;">{{ .Token }}</div><p style="margin:0 0 24px;color:#5f655a;font-size:13px;line-height:21px;">Der Code ist nur einmal und zeitlich begrenzt gültig.</p>` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e8e3;border-radius:16px;overflow:hidden;">
<tr><td bgcolor="#e8ffb9" class="email-pad" style="padding:30px 36px;background:#e8ffb9;border-radius:16px 16px 0 0;">
<div aria-label="VAVE.LOG" style="font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:38px;letter-spacing:-2px;color:#1b1b1b;"><strong style="font-weight:800;">VAVE</strong><span style="font-weight:400;color:#641dff;">.LOG</span></div>
</td></tr>
<tr><td class="email-pad" style="padding:36px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0 0 16px;font-size:11px;font-weight:bold;line-height:18px;letter-spacing:2px;color:#641dff;">${escape(template.eyebrow)}</p>
<h1 class="email-title" style="margin:0 0 24px;font-size:32px;font-weight:600;line-height:38px;letter-spacing:-1px;color:#1b1b1b;">${template.title}</h1>
${template.paragraphs.map(paragraph).join('\n')}
${action}${code}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f8f9f6" style="padding:18px 20px;border-left:3px solid #641dff;background:#f8f9f6;color:#5f655a;font-size:13px;line-height:21px;">${escape(template.note)}</td></tr></table>
</td></tr>
<tr><td class="email-pad" style="padding:22px 36px;border-top:1px solid #e7e8e3;color:#5f655a;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;">VAVE.LOG &middot; ${template.notification ? 'Sicherheitsbenachrichtigung' : 'Dein Account'}<br>Automatische Nachricht zu deinem VAVE.LOG-Konto.</td></tr>
</table>`;
}
function email(template) {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><title>${escape(template.subject)}</title>
<style>@media only screen and (max-width:480px){.email-pad{padding-left:24px!important;padding-right:24px!important}.email-title{font-size:28px!important;line-height:34px!important;overflow-wrap:anywhere}.email-outer{padding:16px 8px!important}}</style></head>
<body style="margin:0;padding:0;width:100%;background:#f8f9f6;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#f8f9f6;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(template.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8f9f6"><tr><td align="center" class="email-outer" style="padding:40px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
${card(template)}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>
`;
}

const outputs = new Map();
const payload = {};
for (const template of templates) {
  outputs.set(`supabase/templates/${template.key}.html`, email(template));
  payload[`mailer_subjects_${template.key}`] = template.subject;
  payload[`mailer_templates_${template.key}_content`] = email(template);
}
// Template-only PATCH. Do not silently alter redirects, SMTP, verification,
// notification switches, providers, registration or other Auth settings.
outputs.set('supabase/auth-email-branding.json', `${JSON.stringify(payload, null, 2)}\n`);
outputs.set('supabase/templates/subjects.json', `${JSON.stringify(Object.fromEntries(templates.map(t => [t.key, { dashboard: t.label, subject: t.subject }])), null, 2)}\n`);
const previewCard = template => card(template)
  .replaceAll('href="{{ .ConfirmationURL }}"', 'href="#preview-note"')
  .replaceAll('{{ .ConfirmationURL }}', 'https://dein-projekt.supabase.co/auth/v1/verify?…')
  .replaceAll('{{ .Token }}', '123456');
outputs.set('docs/email-preview.html', `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VAVE.LOG – E-Mail-Vorlagen</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8f9f6;color:#1b1b1b;font-family:Arial,Helvetica,sans-serif;line-height:1.6}main{max-width:660px;margin:40px auto;padding:0 16px}header{margin-bottom:36px}header h1{font-size:36px;line-height:1.15;letter-spacing:-1px;margin-bottom:12px}header p,section>p{color:#5f655a;font-size:14px}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{color:#641dff;border:1px solid #e0d5ff;background:white;padding:5px 10px;border-radius:6px;font-size:12px;text-decoration:none}section{margin:48px 0;scroll-margin-top:24px}section>h2{font-size:17px;margin-bottom:4px}section>p{margin-top:0}@media(max-width:480px){.email-pad{padding-left:24px!important;padding-right:24px!important}.email-title{font-size:28px!important;line-height:34px!important;overflow-wrap:anywhere}}
</style></head><body><main><header><p>VAVE.LOG / E-MAILS</p><h1>Auch im Postfach<br>unverkennbar VAVE.</h1><p id="preview-note">Vorschau aller 13 Vorlagen. Die Links versenden nichts und melden niemanden an. Der gezeigte Code ist ein Beispiel. Die Vorlagen sind erst nach Einrichtung des Mailversands und Übernahme in Supabase aktiv.</p><nav>${templates.map(t => `<a href="#${t.key}">${escape(t.label)}</a>`).join('')}</nav></header>
${templates.map(t => `<section id="${t.key}"><h2>${escape(t.label)}</h2><p>Betreff: ${escape(t.subject)}</p>${previewCard(t)}</section>`).join('\n')}
</main></body></html>
`);

let different = false;
for (const [relative, content] of outputs) {
  const file = path.join(root, relative);
  if (check) {
    const existing = await readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing !== content) { console.error(`Nicht aktuell: ${relative}`); different = true; }
  } else {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}
if (different) { console.error('Bitte npm run emails:build ausführen und die Änderungen übernehmen.'); process.exitCode = 1; }
else console.log(`${templates.length} VAVE.LOG-E-Mail-Vorlagen ${check ? 'aktuell' : 'erstellt'} (kein Versand, keine Änderung an Supabase).`);
